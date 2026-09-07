import mongoose from "mongoose";
import { RRule, Weekday, Options } from "rrule";
import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import {
  ShiftTemplateModel,
  IShiftTemplate,
  IRecurrenceRule,
  CreateShiftTemplateInput,
  UpdateShiftTemplateInput,
  EditOccurrenceInput,
  SplitSeriesInput,
} from "./shift-template-schemas";
import { ShiftModel, IShift } from "../shift/shift-schemas";
import { validateShiftConstraints } from "../shift/shift-lib";

export async function getAllShiftTemplates(pagination: PaginationInput) {
  return paginate(ShiftTemplateModel, {}, { createdAt: -1 }, pagination);
}

export async function getShiftTemplateById(id: string) {
  const template = await ShiftTemplateModel.findById(id);
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  return template;
}

export async function createShiftTemplate(data: CreateShiftTemplateInput) {
  await validateShiftConstraints(data);

  // No eager generation: occurrences are virtual, expanded from the rule on read
  // (see expandSeries) and materialized into Shift rows only when signed up for
  // or individually edited.
  return ShiftTemplateModel.create(data);
}

// Edit the whole series. Field changes propagate to every occurrence: virtual
// ones recompute for free on read, materialized-but-not-individually-edited ones
// are updated in place, and detached ones keep their own edits. Changing the
// schedule (recurrenceRule) is rejected once occurrences have materialized —
// reshaping a recurrence people already signed up for is ill-defined, so callers
// split the series instead.
const PROPAGATED_FIELDS = ["title", "description", "maxVolunteers", "minAge", "requiredSkills"] as const;

export async function updateShiftTemplate(id: string, data: UpdateShiftTemplateInput) {
  const template = await getShiftTemplateById(id);

  if (data.recurrenceRule !== undefined) {
    const materialized = await ShiftModel.countDocuments({ templateId: id });
    if (materialized > 0) {
      throw new APIError(
        409,
        "SeriesHasOccurrences",
        "Cannot change the schedule of a series with materialized occurrences; split the series instead"
      );
    }
  }

  // Re-validate capacity against the series' location if the cap is being raised.
  if (data.maxVolunteers != null) {
    await validateShiftConstraints({
      locationId: template.locationId.toString(),
      maxVolunteers: data.maxVolunteers,
      startTime: template.startTime,
      endTime: template.endTime,
      eventId: template.eventId?.toString(),
    });
  }

  Object.assign(template, data);
  await template.save();

  const propagate: Record<string, unknown> = {};
  for (const f of PROPAGATED_FIELDS) {
    if (data[f] !== undefined) propagate[f] = data[f];
  }
  if (Object.keys(propagate).length > 0) {
    await ShiftModel.updateMany({ templateId: id, detached: false }, propagate);
  }

  return template;
}

// Edit just one occurrence. Materializes it (idempotent) and detaches it, so
// subsequent series-wide edits leave it alone — the same materialize trigger as
// a signup, but flagged detached.
export async function editOccurrence(id: string, data: EditOccurrenceInput) {
  const { recurrenceId, ...changes } = data;
  const shift = await materializeOccurrence(id, recurrenceId);
  const updated = await ShiftModel.findByIdAndUpdate(
    shift._id,
    { ...changes, detached: true },
    { new: true, runValidators: true }
  );
  return updated;
}

// This and following: split the series at an occurrence slot. The original keeps
// the occurrences before the split; a new series carries the rest with the given
// field changes. Materialized occurrences at/after the split move to the new
// series. The rule shape (frequency/interval/daysOfWeek) is preserved across the
// split; only field values may change.
export async function splitSeries(id: string, data: SplitSeriesInput) {
  const template = await getShiftTemplateById(id);
  const rule = template.recurrenceRule;

  const slots = buildRRule(template.startTime, rule).all();
  const idx = slots.findIndex((s) => s.getTime() === data.splitAt.getTime());
  if (idx <= 0) {
    throw new APIError(
      400,
      "InvalidSplit",
      "splitAt must be an occurrence of the series after its first"
    );
  }

  const durationMs = template.endTime.getTime() - template.startTime.getTime();
  const newSeries = await ShiftTemplateModel.create({
    title: data.title ?? template.title,
    description: data.description ?? template.description,
    locationId: template.locationId,
    eventId: template.eventId,
    startTime: data.splitAt,
    endTime: new Date(data.splitAt.getTime() + durationMs),
    maxVolunteers: data.maxVolunteers ?? template.maxVolunteers,
    minAge: data.minAge ?? template.minAge,
    requiredSkills: data.requiredSkills ?? template.requiredSkills,
    recurrenceRule: {
      frequency: rule.frequency,
      interval: rule.interval,
      daysOfWeek: rule.daysOfWeek,
      occurrences: slots.length - idx,
    },
    createdBy: data.createdBy ?? template.createdBy,
  });

  // Original series now ends at the split: keep only the occurrences before it.
  template.recurrenceRule = {
    frequency: rule.frequency,
    interval: rule.interval,
    daysOfWeek: rule.daysOfWeek,
    occurrences: idx,
  } as IRecurrenceRule;
  await template.save();

  // Re-point already-materialized occurrences at/after the split to the new series.
  await ShiftModel.updateMany(
    { templateId: id, recurrenceId: { $gte: data.splitAt } },
    { templateId: newSeries._id }
  );

  return { original: template, series: newSeries };
}

export async function deleteShiftTemplate(id: string) {
  const template = await ShiftTemplateModel.findByIdAndDelete(id);
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  await ShiftModel.updateMany({ templateId: id }, { $unset: { templateId: "" } });
}

// Cap on how wide an occurrences query may be, so expanding a daily rule can't
// return an unbounded list. Reads must pass a bounded [from, to] window.
const MAX_RANGE_DAYS = 366;

const FREQ_MAP = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
} as const;

// Our daysOfWeek use the JS convention (0=Sunday..6=Saturday); rrule's Weekday
// constants use MO=0..SU=6. Index by JS day to translate.
const RRULE_WEEKDAYS: Weekday[] = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];

// rrule operates in UTC: dtStart's UTC fields define the recurrence, and returned
// occurrences carry the same wall time in UTC — so times never drift across
// timezones or DST, unlike hand-rolled date arithmetic.
function buildRRule(startDate: Date, rule: IRecurrenceRule): RRule {
  const options: Partial<Options> = {
    freq: FREQ_MAP[rule.frequency],
    interval: rule.interval ?? 1,
    dtstart: startDate,
  };

  if (rule.frequency === "weekly" && rule.daysOfWeek?.length) {
    options.byweekday = rule.daysOfWeek.map((d) => RRULE_WEEKDAYS[d]);
  }
  if (rule.occurrences != null) options.count = rule.occurrences;
  if (rule.endDate) options.until = rule.endDate;

  return new RRule(options);
}

// A single occurrence of a series within a date range. `concrete: true` means it
// is backed by a real Shift row — materialized because it was signed up for or
// individually edited; otherwise it's a virtual occurrence computed from the rule
// and reported with the series' default field values.
export interface OccurrenceView {
  seriesId: string;
  recurrenceId: Date; // original slot start — the stable key
  startTime: Date;
  endTime: Date;
  title: string;
  description?: string;
  locationId: string;
  eventId?: string;
  maxVolunteers?: number;
  minAge?: number;
  requiredSkills?: string[];
  status: string;
  currentVolunteers: number;
  concrete: boolean;
  shiftId?: string; // present iff concrete
}

type SeriesDoc = IShiftTemplate & { _id: mongoose.Types.ObjectId };
type ShiftDoc = IShift & { _id: mongoose.Types.ObjectId };

// Pure: expand a series over [range.from, range.to], overlaying any concrete
// override shifts (matched by recurrenceId) on top of the rule-generated slots.
// No DB or HTTP access — callers pass in the overrides they've already loaded.
export function expandSeries(
  series: SeriesDoc,
  range: { from: Date; to: Date },
  overrides: ShiftDoc[]
): OccurrenceView[] {
  const durationMs = series.endTime.getTime() - series.startTime.getTime();
  const slots = buildRRule(series.startTime, series.recurrenceRule).between(
    range.from,
    range.to,
    true
  );

  // Index overrides by their slot instant for O(1) overlay.
  const overrideBySlot = new Map<number, ShiftDoc>();
  for (const o of overrides) {
    if (o.recurrenceId) overrideBySlot.set(o.recurrenceId.getTime(), o);
  }

  return slots.map((slot) => {
    const override = overrideBySlot.get(slot.getTime());
    if (override) {
      return {
        seriesId: series._id.toString(),
        recurrenceId: slot,
        startTime: override.startTime,
        endTime: override.endTime,
        title: override.title,
        description: override.description,
        locationId: override.locationId.toString(),
        eventId: override.eventId?.toString(),
        maxVolunteers: override.maxVolunteers,
        minAge: override.minAge,
        requiredSkills: override.requiredSkills,
        status: override.status,
        currentVolunteers: override.currentVolunteers,
        concrete: true,
        shiftId: override._id.toString(),
      };
    }
    return {
      seriesId: series._id.toString(),
      recurrenceId: slot,
      startTime: slot,
      endTime: new Date(slot.getTime() + durationMs),
      title: series.title,
      description: series.description,
      locationId: series.locationId.toString(),
      eventId: series.eventId?.toString(),
      maxVolunteers: series.maxVolunteers,
      minAge: series.minAge,
      requiredSkills: series.requiredSkills,
      status: "published",
      currentVolunteers: 0,
      concrete: false,
    };
  });
}

// Read path: expand a series over a bounded window, overlaying concrete override
// shifts. Virtual occurrences are reported as `published` (a series' occurrences
// are open for signup by default).
export async function getSeriesOccurrences(
  id: string,
  from: Date,
  to: Date
): Promise<OccurrenceView[]> {
  const template = await getShiftTemplateById(id);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new APIError(400, "InvalidRange", "from and to must be valid dates");
  }
  if (to <= from) {
    throw new APIError(400, "InvalidRange", "to must be after from");
  }
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    throw new APIError(400, "RangeTooLarge", `Range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const overrides = (await ShiftModel.find({ templateId: id })) as unknown as ShiftDoc[];
  return expandSeries(template.toObject() as SeriesDoc, { from, to }, overrides);
}

// Validate that recurrenceId is an actual slot of the series' rule (not an
// arbitrary date), returning the series. Lets callers check a virtual occurrence
// without creating a row.
export async function assertOccurrence(
  templateId: string,
  recurrenceId: Date
): Promise<SeriesDoc> {
  const template = await getShiftTemplateById(templateId);
  const slots = buildRRule(template.startTime, template.recurrenceRule).between(
    new Date(recurrenceId.getTime() - 1000),
    new Date(recurrenceId.getTime() + 1000),
    true
  );
  if (!slots.some((s) => s.getTime() === recurrenceId.getTime())) {
    throw new APIError(400, "InvalidOccurrence", "recurrenceId is not an occurrence of this series");
  }
  return template.toObject() as SeriesDoc;
}

// Signup/edit path: turn a virtual occurrence into a real Shift row. Idempotent
// via the unique (templateId, recurrenceId) index — concurrent callers converge
// on one row rather than racing to create duplicates.
export async function materializeOccurrence(
  templateId: string,
  recurrenceId: Date
): Promise<ShiftDoc> {
  const template = await assertOccurrence(templateId, recurrenceId);

  const durationMs = template.endTime.getTime() - template.startTime.getTime();
  const shift = await ShiftModel.findOneAndUpdate(
    { templateId: template._id, recurrenceId },
    {
      $setOnInsert: {
        title: template.title,
        description: template.description,
        locationId: template.locationId,
        eventId: template.eventId,
        templateId: template._id,
        recurrenceId,
        detached: false,
        startTime: recurrenceId,
        endTime: new Date(recurrenceId.getTime() + durationMs),
        maxVolunteers: template.maxVolunteers,
        minAge: template.minAge,
        requiredSkills: template.requiredSkills,
        status: "published",
        createdBy: template.createdBy,
      },
    },
    { new: true, upsert: true }
  );
  return shift as unknown as ShiftDoc;
}

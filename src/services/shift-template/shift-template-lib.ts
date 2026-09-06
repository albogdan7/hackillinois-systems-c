import mongoose from "mongoose";
import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import {
  ShiftTemplateModel,
  IShiftTemplate,
  IRecurrenceRule,
  CreateShiftTemplateInput,
  UpdateShiftTemplateInput,
} from "./shift-template-schemas";
import { ShiftModel } from "../shift/shift-schemas";
import { LocationModel } from "../location/location-schemas";
import { EventModel } from "../event/event-schemas";

export async function getAllShiftTemplates(pagination: PaginationInput) {
  return paginate(ShiftTemplateModel, {}, { createdAt: -1 }, pagination);
}

export async function getShiftTemplateById(id: string) {
  const template = await ShiftTemplateModel.findById(id);
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  return template;
}

export async function createShiftTemplate(data: CreateShiftTemplateInput) {
  const location = await LocationModel.findById(data.locationId);
  if (!location) throw new APIError(404, "LocationNotFound", "Location not found");

  if (location.capacity && data.maxVolunteers > location.capacity) {
    throw new APIError(
      400,
      "ExceedsLocationCapacity",
      `maxVolunteers (${data.maxVolunteers}) exceeds location capacity (${location.capacity})`
    );
  }

  if (data.eventId) {
    const event = await EventModel.findById(data.eventId);
    if (!event) throw new APIError(404, "EventNotFound", "Event not found");
    if (data.startTime < event.startDate || data.endTime > event.endDate) {
      throw new APIError(
        400,
        "OutsideEventWindow",
        "Template shift must start and end within the event's date range"
      );
    }
  }

  const template = await ShiftTemplateModel.create(data);
  await generateShifts(template.toObject() as IShiftTemplate & { _id: mongoose.Types.ObjectId });
  return template;
}

export async function updateShiftTemplate(id: string, data: UpdateShiftTemplateInput) {
  const template = await ShiftTemplateModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  return template;
}

export async function deleteShiftTemplate(id: string) {
  const template = await ShiftTemplateModel.findByIdAndDelete(id);
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  await ShiftModel.updateMany({ templateId: id }, { $unset: { templateId: "" } });
}

function generateOccurrenceDates(startDate: Date, rule: IRecurrenceRule): Date[] {
  const dates: Date[] = [];
  const limit = rule.occurrences ?? 100;
  const endDate = rule.endDate ? new Date(rule.endDate) : null;

  if (rule.frequency === "weekly" && rule.daysOfWeek?.length) {
    const weekInterval = rule.interval ?? 1;
    const start = new Date(startDate);

    const weekAnchor = new Date(start);
    weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay());
    weekAnchor.setHours(0, 0, 0, 0);

    let weekNum = 0;

    while (dates.length < limit) {
      if (weekNum % weekInterval === 0) {
        for (const targetDay of [...rule.daysOfWeek].sort((a, b) => a - b)) {
          const date = new Date(weekAnchor);
          date.setDate(weekAnchor.getDate() + targetDay);

          if (date >= start) {
            if (endDate && date > endDate) return dates;
            if (dates.length >= limit) return dates;
            dates.push(new Date(date));
          }
        }
      }

      weekAnchor.setDate(weekAnchor.getDate() + 7);
      weekNum++;

      if (endDate && weekAnchor > endDate) break;
    }
  } else {
    const interval = rule.interval ?? 1;
    let current = new Date(startDate);

    while (dates.length < limit && (!endDate || current <= endDate)) {
      dates.push(new Date(current));

      switch (rule.frequency) {
        case "daily":
          current.setDate(current.getDate() + interval);
          break;
        case "weekly":
          current.setDate(current.getDate() + interval * 7);
          break;
        case "monthly":
          current.setMonth(current.getMonth() + interval);
          break;
      }
    }
  }

  return dates;
}

async function generateShifts(template: IShiftTemplate & { _id: mongoose.Types.ObjectId }) {
  const baseStart = new Date(template.startTime);
  const hours = baseStart.getHours();
  const minutes = baseStart.getMinutes();
  const durationMs = template.endTime.getTime() - template.startTime.getTime();

  const dates = generateOccurrenceDates(baseStart, template.recurrenceRule);

  const shifts = dates.map((date) => {
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime.getTime() + durationMs);
    return {
      title: template.title,
      description: template.description,
      locationId: template.locationId,
      eventId: template.eventId,
      templateId: template._id,
      startTime,
      endTime,
      maxVolunteers: template.maxVolunteers,
      requiredSkills: template.requiredSkills,
      status: "draft" as const,
      createdBy: template.createdBy,
    };
  });

  const created = await ShiftModel.insertMany(shifts);
  if (created.length > 0) {
    await ShiftTemplateModel.findByIdAndUpdate(template._id, {
      generatedUntil: created[created.length - 1].endTime,
    });
  }
  return created;
}

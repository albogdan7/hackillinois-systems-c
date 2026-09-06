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

export async function getAllShiftTemplates(pagination: PaginationInput) {
  return paginate(ShiftTemplateModel, {}, { createdAt: -1 }, pagination);
}

export async function getShiftTemplateById(id: string) {
  const template = await ShiftTemplateModel.findById(id);
  if (!template) throw new APIError(404, "TemplateNotFound", "Shift template not found");
  return template;
}

export async function createShiftTemplate(data: CreateShiftTemplateInput) {
  const shift = await ShiftModel.findById(data.shiftId);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Base shift not found");

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
  // Nullify templateId on generated shifts rather than deleting them
  await ShiftModel.updateMany({ templateId: id }, { $unset: { templateId: "" } });
}

function generateOccurrenceDates(startDate: Date, rule: IRecurrenceRule): Date[] {
  const dates: Date[] = [];
  const limit = rule.occurrences ?? 100;
  const endDate = rule.endDate ? new Date(rule.endDate) : null;

  if (rule.frequency === "weekly" && rule.daysOfWeek?.length) {
    // Iterate day-by-day, track which week we're in for interval support
    const weekInterval = rule.interval ?? 1;
    const start = new Date(startDate);

    // Find the Sunday of the start week
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
  const baseShift = await ShiftModel.findById(template.shiftId);
  if (!baseShift) throw new APIError(404, "ShiftNotFound", "Base shift not found");

  const baseStart = new Date(baseShift.startTime);
  const hours = baseStart.getHours();
  const minutes = baseStart.getMinutes();
  const durationMs = baseShift.endTime.getTime() - baseShift.startTime.getTime();

  const dates = generateOccurrenceDates(baseStart, template.recurrenceRule);

  const shifts = dates.map((date) => {
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime.getTime() + durationMs);
    return {
      title: baseShift.title,
      description: baseShift.description,
      locationId: baseShift.locationId,
      eventId: baseShift.eventId,
      templateId: template._id,
      startTime,
      endTime,
      maxVolunteers: baseShift.maxVolunteers,
      requiredSkills: baseShift.requiredSkills,
      status: "draft" as const,
      createdBy: template.createdBy,
    };
  });

  return ShiftModel.insertMany(shifts);
}

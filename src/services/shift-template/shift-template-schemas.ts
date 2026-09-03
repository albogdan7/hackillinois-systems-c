import mongoose from "mongoose";
import { z } from "zod";
import { SKILLS, SkillEnum } from "../../common/schemas";

export interface IRecurrenceRule {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  occurrences?: number;
}

export interface IShiftTemplate {
  title: string;
  description?: string;
  locationId: mongoose.Types.ObjectId;
  eventId?: mongoose.Types.ObjectId;
  startDate: Date;
  startTimeOfDay: string;
  durationMinutes: number;
  maxVolunteers: number;
  requiredSkills?: string[];
  recurrenceRule: IRecurrenceRule;
  createdBy: string;
  updatedBy?: string;
}

const RecurrenceRuleSchema = new mongoose.Schema<IRecurrenceRule>(
  {
    frequency: { type: String, enum: ["daily", "weekly", "monthly"], required: true },
    interval: { type: Number, default: 1, min: 1 },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    endDate: { type: Date },
    occurrences: { type: Number, min: 1 },
  },
  { _id: false }
);

const ShiftTemplateSchema = new mongoose.Schema<IShiftTemplate>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
    startDate: { type: Date, required: true },
    startTimeOfDay: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    maxVolunteers: { type: Number, required: true, min: 1 },
    requiredSkills: [{ type: String, enum: SKILLS }],
    recurrenceRule: { type: RecurrenceRuleSchema, required: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const ShiftTemplateModel = mongoose.model<IShiftTemplate>(
  "ShiftTemplate",
  ShiftTemplateSchema
);

const RecurrenceRuleZodSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).default(1),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    endDate: z.coerce.date().optional(),
    occurrences: z.number().int().min(1).optional(),
  })
  .refine((d) => d.endDate !== undefined || d.occurrences !== undefined, {
    message: "Either endDate or occurrences must be specified",
  });

export const CreateShiftTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  locationId: z.string().min(1),
  eventId: z.string().optional(),
  startDate: z.coerce.date(),
  startTimeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format"),
  durationMinutes: z.number().int().min(1),
  maxVolunteers: z.number().int().min(1),
  requiredSkills: z.array(SkillEnum).optional(),
  recurrenceRule: RecurrenceRuleZodSchema,
  createdBy: z.string().min(1),
});

export const UpdateShiftTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  locationId: z.string().optional(),
  eventId: z.string().optional(),
  maxVolunteers: z.number().int().min(1).optional(),
  requiredSkills: z.array(SkillEnum).optional(),
  updatedBy: z.string().min(1).optional(),
});

export type CreateShiftTemplateInput = z.infer<typeof CreateShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof UpdateShiftTemplateSchema>;

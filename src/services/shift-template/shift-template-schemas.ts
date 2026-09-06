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
  startTime: Date;
  endTime: Date;
  maxVolunteers: number;
  requiredSkills?: string[];
  recurrenceRule: IRecurrenceRule;
  generatedUntil?: Date;
  createdBy: string;
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
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    maxVolunteers: { type: Number, required: true, min: 1 },
    requiredSkills: [{ type: String, enum: SKILLS }],
    recurrenceRule: { type: RecurrenceRuleSchema, required: true },
    generatedUntil: { type: Date },
    createdBy: { type: String, required: true },
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

export const CreateShiftTemplateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    locationId: z.string().min(1),
    eventId: z.string().optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    maxVolunteers: z.number().int().min(1),
    requiredSkills: z.array(SkillEnum).optional(),
    recurrenceRule: RecurrenceRuleZodSchema,
    createdBy: z.string().min(1),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const UpdateShiftTemplateSchema = z.object({
  recurrenceRule: RecurrenceRuleZodSchema.optional(),
});

export type CreateShiftTemplateInput = z.infer<typeof CreateShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof UpdateShiftTemplateSchema>;

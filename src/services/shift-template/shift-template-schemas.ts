import mongoose from "mongoose";
import { z } from "zod";
import { SKILLS } from "../../common/schemas";
import { ShiftShapeSchema } from "../shift/shift-schemas";

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
  maxVolunteers?: number;
  minAge?: number;
  requiredSkills?: string[];
  recurrenceRule: IRecurrenceRule;
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
    maxVolunteers: { type: Number, min: 1 },
    minAge: { type: Number, min: 0 },
    requiredSkills: [{ type: String, enum: SKILLS }],
    recurrenceRule: { type: RecurrenceRuleSchema, required: true },
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

export const CreateShiftTemplateSchema = ShiftShapeSchema.extend({
  recurrenceRule: RecurrenceRuleZodSchema,
  createdBy: z.string().min(1),
}).refine((d) => d.endTime > d.startTime, {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

// "Edit the whole series." Field changes always apply; a recurrenceRule change
// is a schedule change and is only accepted while the series has no materialized
// occurrences (enforced in the lib) — otherwise callers must split instead.
export const UpdateShiftTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  maxVolunteers: z.number().int().min(1).optional(),
  minAge: z.number().int().min(0).optional(),
  requiredSkills: z.array(z.enum(SKILLS)).optional(),
  recurrenceRule: RecurrenceRuleZodSchema.optional(),
  updatedBy: z.string().min(1).optional(),
});

// "Edit just this occurrence." Identified by its recurrence slot; materializes
// and detaches the occurrence, then applies the changes.
export const EditOccurrenceSchema = z.object({
  recurrenceId: z.coerce.date(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  maxVolunteers: z.number().int().min(1).optional(),
  minAge: z.number().int().min(0).optional(),
  requiredSkills: z.array(z.enum(SKILLS)).optional(),
  updatedBy: z.string().min(1).optional(),
});

// "This and following." Splits the series at an occurrence slot: the original
// series keeps everything before it, a new series carries the rest with the
// given field changes.
export const SplitSeriesSchema = z.object({
  splitAt: z.coerce.date(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  maxVolunteers: z.number().int().min(1).optional(),
  minAge: z.number().int().min(0).optional(),
  requiredSkills: z.array(z.enum(SKILLS)).optional(),
  createdBy: z.string().min(1).optional(),
});

export type CreateShiftTemplateInput = z.infer<typeof CreateShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof UpdateShiftTemplateSchema>;
export type EditOccurrenceInput = z.infer<typeof EditOccurrenceSchema>;
export type SplitSeriesInput = z.infer<typeof SplitSeriesSchema>;

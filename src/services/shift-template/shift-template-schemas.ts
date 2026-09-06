import mongoose from "mongoose";
import { z } from "zod";

export interface IRecurrenceRule {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  occurrences?: number;
}

export interface IShiftTemplate {
  shiftId: mongoose.Types.ObjectId;
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
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", required: true },
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

export const CreateShiftTemplateSchema = z.object({
  shiftId: z.string().min(1),
  recurrenceRule: RecurrenceRuleZodSchema,
  createdBy: z.string().min(1),
});

export const UpdateShiftTemplateSchema = z.object({
  recurrenceRule: RecurrenceRuleZodSchema.optional(),
});

export type CreateShiftTemplateInput = z.infer<typeof CreateShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof UpdateShiftTemplateSchema>;

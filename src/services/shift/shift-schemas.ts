import mongoose from "mongoose";
import { z } from "zod";
import { SKILLS, SkillEnum } from "../../common/schemas";

export const SHIFT_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
} as const;

export type ShiftStatus = (typeof SHIFT_STATUS)[keyof typeof SHIFT_STATUS];

export interface IShift {
  title: string;
  description?: string;
  locationId: mongoose.Types.ObjectId;
  eventId?: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  startTime: Date;
  endTime: Date;
  maxVolunteers?: number;
  currentVolunteers: number;
  requiredSkills?: string[];
  status: ShiftStatus;
  createdBy: string;
  updatedBy?: string;
}

const ShiftSchema = new mongoose.Schema<IShift>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "ShiftTemplate" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    // Optional: absent means the shift is uncapped (unlimited volunteers)
    maxVolunteers: { type: Number, min: 1 },
    currentVolunteers: { type: Number, default: 0, min: 0 },
    requiredSkills: [{ type: String, enum: SKILLS }],
    status: {
      type: String,
      enum: Object.values(SHIFT_STATUS),
      default: SHIFT_STATUS.DRAFT,
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

// eventId: getEventShifts, getEventSummary aggregation
ShiftSchema.index({ eventId: 1 });
// status + startTime: paginated listing with status filter and time-range queries
ShiftSchema.index({ status: 1, startTime: 1 });
// requiredSkills: skill filter (multikey index — one entry per element)
ShiftSchema.index({ requiredSkills: 1 });

export const ShiftModel = mongoose.model<IShift>("Shift", ShiftSchema);

// The common "shape of a shift" — shared with CreateShiftTemplateSchema, since a
// template defines the same shift fields plus a recurrence rule.
export const ShiftShapeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  locationId: z.string().min(1),
  eventId: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  maxVolunteers: z.number().int().min(1).optional(),
  requiredSkills: z.array(SkillEnum).optional(),
});

export const CreateShiftSchema = ShiftShapeSchema.extend({
  status: z.enum(["draft", "published", "cancelled"]).default("draft"),
  createdBy: z.string().min(1),
}).refine((d) => d.endTime > d.startTime, {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

export const UpdateShiftSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    locationId: z.string().optional(),
    eventId: z.string().optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    maxVolunteers: z.number().int().min(1).optional(),
    requiredSkills: z.array(SkillEnum).optional(),
    updatedBy: z.string().min(1).optional(),
  })
  .refine((d) => !d.startTime || !d.endTime || d.endTime > d.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;

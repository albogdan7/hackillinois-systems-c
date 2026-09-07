import mongoose from "mongoose";
import { z } from "zod";

export const EVENT_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
} as const;

export type EventStatus = (typeof EVENT_STATUS)[keyof typeof EVENT_STATUS];

export interface IEvent {
  name: string;
  description?: string;
  hostId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
  cancelledAt?: Date;
  cancellationReason?: string;
  cancelledBy?: string;
  createdBy: string;
  updatedBy?: string;
}

const EventSchema = new mongoose.Schema<IEvent>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "Host", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(EVENT_STATUS),
      default: EVENT_STATUS.DRAFT,
    },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    cancelledBy: { type: String },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

// status: getAllEvents status filter
EventSchema.index({ status: 1 });
// hostId: getHostEvents lookup of an organization's events
EventSchema.index({ hostId: 1 });

export const EventModel = mongoose.model<IEvent>("Event", EventSchema);

export const CreateEventSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    hostId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: z.enum(["draft", "published", "cancelled", "completed"]).default("draft"),
    createdBy: z.string().min(1),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const UpdateEventSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    hostId: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    updatedBy: z.string().min(1).optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const CancelEventSchema = z.object({
  cancellationReason: z.string().optional(),
  cancelledBy: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

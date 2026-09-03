import mongoose from "mongoose";
import { z } from "zod";

export type EventStatus = "draft" | "published" | "cancelled";

export interface IEvent {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
  createdBy: string;
  updatedBy?: string;
}

const EventSchema = new mongoose.Schema<IEvent>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "cancelled"],
      default: "draft",
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const EventModel = mongoose.model<IEvent>("Event", EventSchema);

export const CreateEventSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: z.enum(["draft", "published", "cancelled"]).default("draft"),
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
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    updatedBy: z.string().min(1).optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

import mongoose from "mongoose";
import { z } from "zod";

export interface ILocation {
  name: string;
  description?: string;
  building?: string;
  capacity?: number;
}

const LocationSchema = new mongoose.Schema<ILocation>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    building: { type: String },
    capacity: { type: Number, min: 1 },
  },
  { timestamps: true }
);

export const LocationModel = mongoose.model<ILocation>("Location", LocationSchema);

export const CreateLocationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  building: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
});

export const UpdateLocationSchema = CreateLocationSchema.partial();

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;

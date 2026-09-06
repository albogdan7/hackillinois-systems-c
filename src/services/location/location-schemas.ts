import mongoose from "mongoose";
import { z } from "zod";

export interface ILocation {
  name: string;
  address?: string;
  capacity?: number;
}

const LocationSchema = new mongoose.Schema<ILocation>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    address: { type: String },
    capacity: { type: Number, min: 1 },
  },
  { timestamps: true }
);

export const LocationModel = mongoose.model<ILocation>("Location", LocationSchema);

export const CreateLocationSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
});

export const UpdateLocationSchema = CreateLocationSchema.partial();

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;

import mongoose from "mongoose";
import { z } from "zod";

// A host is the organization/business putting on an event. `contact` is the
// person to reach out to about that host's events.
export interface IHostContact {
  name: string;
  email: string;
  phone?: string;
}

export interface IHost {
  companyName: string;
  description?: string;
  contact: IHostContact;
  createdBy: string;
  updatedBy?: string;
}

const HostSchema = new mongoose.Schema<IHost>(
  {
    companyName: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    contact: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const HostModel = mongoose.model<IHost>("Host", HostSchema);

const HostContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export const CreateHostSchema = z.object({
  companyName: z.string().min(1),
  description: z.string().optional(),
  contact: HostContactSchema,
  createdBy: z.string().min(1),
});

export const UpdateHostSchema = z.object({
  companyName: z.string().min(1).optional(),
  description: z.string().optional(),
  contact: HostContactSchema.optional(),
  updatedBy: z.string().min(1).optional(),
});

export type CreateHostInput = z.infer<typeof CreateHostSchema>;
export type UpdateHostInput = z.infer<typeof UpdateHostSchema>;

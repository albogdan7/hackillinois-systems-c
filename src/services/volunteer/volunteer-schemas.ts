import mongoose from "mongoose";
import { z } from "zod";
import { SKILLS, SkillEnum } from "../../common/schemas";

export interface IEmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface IVolunteer {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skills?: string[];
  emergencyContact?: IEmergencyContact;
}

const VolunteerSchema = new mongoose.Schema<IVolunteer>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    skills: [{ type: String, enum: SKILLS }],
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relationship: { type: String },
    },
  },
  { timestamps: true }
);

export const VolunteerModel = mongoose.model<IVolunteer>("Volunteer", VolunteerSchema);

const EmergencyContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  relationship: z.string().min(1),
});

export const CreateVolunteerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  skills: z.array(SkillEnum).optional(),
  emergencyContact: EmergencyContactSchema.optional(),
});

export const UpdateVolunteerSchema = CreateVolunteerSchema.partial();

export type CreateVolunteerInput = z.infer<typeof CreateVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof UpdateVolunteerSchema>;

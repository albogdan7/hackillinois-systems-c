import mongoose from "mongoose";
import { z } from "zod";

export const SIGNUP_STATUS = {
  CONFIRMED: "confirmed",
  WAITLISTED: "waitlisted",
  CANCELLED: "cancelled",
  NO_SHOW: "no-show",
  COMPLETED: "completed",
} as const;

export type SignupStatus = (typeof SIGNUP_STATUS)[keyof typeof SIGNUP_STATUS];

export interface ISignup {
  volunteerId: mongoose.Types.ObjectId;
  shiftId: mongoose.Types.ObjectId;
  status: SignupStatus;
  checkedInAt?: Date;
  checkedOutAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdBy: string;
  updatedBy?: string;
}

const SignupSchema = new mongoose.Schema<ISignup>(
  {
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Volunteer",
      required: true,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SIGNUP_STATUS),
      required: true,
    },
    checkedInAt: { type: Date },
    checkedOutAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

SignupSchema.index({ volunteerId: 1, shiftId: 1 }, { unique: true });
// shiftId: counts, signups list, cascade cancellation, no-show marking
SignupSchema.index({ shiftId: 1 });
// volunteerId: volunteer signup history, overlap detection on every new signup
SignupSchema.index({ volunteerId: 1 });

export const SignupModel = mongoose.model<ISignup>("Signup", SignupSchema);

export const CreateSignupSchema = z.object({
  volunteerId: z.string().min(1),
  shiftId: z.string().min(1),
  createdBy: z.string().min(1),
});

export const CancelSignupSchema = z.object({
  cancellationReason: z.string().optional(),
});

export const UpdateSignupStatusSchema = z.object({
  status: z.enum(Object.values(SIGNUP_STATUS) as [SignupStatus, ...SignupStatus[]]),
});

export type CreateSignupInput = z.infer<typeof CreateSignupSchema>;

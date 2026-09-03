import mongoose from "mongoose";
import { z } from "zod";

export type SignupStatus =
  | "confirmed"
  | "waitlisted"
  | "cancelled"
  | "no-show"
  | "completed";

export interface ISignup {
  volunteerId: mongoose.Types.ObjectId;
  shiftId: mongoose.Types.ObjectId;
  status: SignupStatus;
  checkedInAt?: Date;
  checkedOutAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
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
      enum: ["confirmed", "waitlisted", "cancelled", "no-show", "completed"],
      required: true,
    },
    checkedInAt: { type: Date },
    checkedOutAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
  },
  { timestamps: true }
);

SignupSchema.index({ volunteerId: 1, shiftId: 1 }, { unique: true });

export const SignupModel = mongoose.model<ISignup>("Signup", SignupSchema);

export const CreateSignupSchema = z.object({
  volunteerId: z.string().min(1),
  shiftId: z.string().min(1),
});

export const CancelSignupSchema = z.object({
  cancellationReason: z.string().optional(),
});

export const UpdateSignupStatusSchema = z.object({
  status: z.enum(["confirmed", "waitlisted", "cancelled", "no-show", "completed"]),
});

export type CreateSignupInput = z.infer<typeof CreateSignupSchema>;

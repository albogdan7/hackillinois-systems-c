import { APIError } from "../../common/errors";
import {
  VolunteerModel,
  CreateVolunteerInput,
  UpdateVolunteerInput,
} from "./volunteer-schemas";
import { SignupModel } from "../signup/signup-schemas";

export async function getAllVolunteers() {
  return VolunteerModel.find().sort({ lastName: 1, firstName: 1 });
}

export async function getVolunteerById(id: string) {
  const volunteer = await VolunteerModel.findById(id);
  if (!volunteer) {
    throw new APIError(404, "VolunteerNotFound", "Volunteer not found");
  }
  return volunteer;
}

export async function createVolunteer(data: CreateVolunteerInput) {
  const existing = await VolunteerModel.findOne({ email: data.email.toLowerCase() });
  if (existing) {
    throw new APIError(409, "EmailConflict", `A volunteer with email "${data.email}" already exists`);
  }
  return VolunteerModel.create(data);
}

export async function updateVolunteer(id: string, data: UpdateVolunteerInput) {
  if (data.email) {
    const existing = await VolunteerModel.findOne({
      email: data.email.toLowerCase(),
      _id: { $ne: id },
    });
    if (existing) {
      throw new APIError(409, "EmailConflict", `A volunteer with email "${data.email}" already exists`);
    }
  }
  const volunteer = await VolunteerModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!volunteer) {
    throw new APIError(404, "VolunteerNotFound", "Volunteer not found");
  }
  return volunteer;
}

export async function deleteVolunteer(id: string) {
  const volunteer = await VolunteerModel.findByIdAndDelete(id);
  if (!volunteer) {
    throw new APIError(404, "VolunteerNotFound", "Volunteer not found");
  }
}

export async function getVolunteerSignups(id: string) {
  await getVolunteerById(id);
  return SignupModel.find({ volunteerId: id })
    .populate("shiftId")
    .sort({ createdAt: -1 });
}

export async function getVolunteerHours(id: string) {
  await getVolunteerById(id);
  const signups = await SignupModel.find({
    volunteerId: id,
    status: "completed",
    checkedInAt: { $exists: true },
    checkedOutAt: { $exists: true },
  }).populate<{ shiftId: { startTime: Date; endTime: Date } }>("shiftId");

  const totalMinutes = signups.reduce((sum, signup) => {
    if (!signup.checkedInAt || !signup.checkedOutAt) return sum;
    return sum + (signup.checkedOutAt.getTime() - signup.checkedInAt.getTime()) / 60000;
  }, 0);

  return { volunteerId: id, totalHours: Math.round((totalMinutes / 60) * 100) / 100 };
}

import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import { SignupModel, SignupStatus, CreateSignupInput } from "./signup-schemas";
import { VolunteerModel } from "../volunteer/volunteer-schemas";
import { ShiftModel } from "../shift/shift-schemas";

const VALID_TRANSITIONS: Record<SignupStatus, SignupStatus[]> = {
  confirmed: ["cancelled", "no-show", "completed"],
  waitlisted: ["confirmed", "cancelled"],
  cancelled: [],
  "no-show": [],
  completed: [],
};

export async function getAllSignups(
  filters: { volunteerId?: string; shiftId?: string; status?: string },
  pagination: PaginationInput
) {
  const query: Record<string, unknown> = {};
  if (filters.volunteerId) query.volunteerId = filters.volunteerId;
  if (filters.shiftId) query.shiftId = filters.shiftId;
  if (filters.status) query.status = filters.status;
  return paginate(SignupModel, query, { createdAt: -1 }, pagination);
}

export async function getSignupById(id: string) {
  const signup = await SignupModel.findById(id);
  if (!signup) throw new APIError(404, "SignupNotFound", "Signup not found");
  return signup;
}

export async function createSignup(data: CreateSignupInput) {
  const volunteer = await VolunteerModel.findById(data.volunteerId);
  if (!volunteer) throw new APIError(404, "VolunteerNotFound", "Volunteer not found");

  const shift = await ShiftModel.findById(data.shiftId);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Shift not found");
  if (shift.status !== "published") {
    throw new APIError(400, "ShiftNotAvailable", "Shift is not published and open for signup");
  }

  const existing = await SignupModel.findOne({
    volunteerId: data.volunteerId,
    shiftId: data.shiftId,
    status: { $in: ["confirmed", "waitlisted"] },
  });
  if (existing) {
    throw new APIError(409, "AlreadySignedUp", "Volunteer is already signed up for this shift");
  }

  if (shift.requiredSkills?.length) {
    const volunteerSkills = volunteer.skills ?? [];
    const missing = shift.requiredSkills.filter((s) => !volunteerSkills.includes(s));
    if (missing.length > 0) {
      throw new APIError(
        400,
        "InsufficientSkills",
        `Volunteer is missing required skills: ${missing.join(", ")}`
      );
    }
  }

  const confirmedSignups = await SignupModel.find({
    volunteerId: data.volunteerId,
    status: "confirmed",
  }).lean();

  if (confirmedSignups.length > 0) {
    const confirmedShiftIds = confirmedSignups.map((s) => s.shiftId);
    const overlapping = await ShiftModel.findOne({
      _id: { $in: confirmedShiftIds },
      startTime: { $lt: shift.endTime },
      endTime: { $gt: shift.startTime },
    });
    if (overlapping) {
      throw new APIError(
        409,
        "ShiftOverlap",
        "Volunteer already has a confirmed shift that overlaps with this one"
      );
    }
  }

  const confirmedCount = await SignupModel.countDocuments({
    shiftId: data.shiftId,
    status: "confirmed",
  });

  const status: SignupStatus = confirmedCount < shift.maxVolunteers ? "confirmed" : "waitlisted";

  return SignupModel.create({ ...data, status });
}

export async function cancelSignup(id: string, cancellationReason?: string) {
  const signup = await SignupModel.findById(id);
  if (!signup) throw new APIError(404, "SignupNotFound", "Signup not found");

  if (!VALID_TRANSITIONS[signup.status].includes("cancelled")) {
    throw new APIError(
      400,
      "InvalidStatusTransition",
      `Cannot cancel a signup with status '${signup.status}'`
    );
  }

  const wasConfirmed = signup.status === "confirmed";

  signup.status = "cancelled";
  signup.cancelledAt = new Date();
  if (cancellationReason) signup.cancellationReason = cancellationReason;
  await signup.save();

  if (wasConfirmed) {
    await promoteNextWaitlisted(signup.shiftId.toString());
  }

  return signup;
}

async function promoteNextWaitlisted(shiftId: string) {
  const shift = await ShiftModel.findById(shiftId);
  if (!shift) return;

  // Find waitlisted signups ordered by sign-up time (createdAt)
  const waitlisted = await SignupModel.find({ shiftId, status: "waitlisted" })
    .sort({ createdAt: 1 })
    .lean();

  for (const candidate of waitlisted) {
    const volunteer = await VolunteerModel.findById(candidate.volunteerId);
    if (!volunteer) continue;

    // Verify skills still match (shift may have been updated)
    if (shift.requiredSkills?.length) {
      const volunteerSkills = volunteer.skills ?? [];
      const missing = shift.requiredSkills.filter((s) => !volunteerSkills.includes(s));
      if (missing.length > 0) continue;
    }

    // Verify no overlap with other confirmed shifts
    const confirmedSignups = await SignupModel.find({
      volunteerId: candidate.volunteerId,
      status: "confirmed",
      _id: { $ne: candidate._id },
    }).lean();

    const confirmedShiftIds = confirmedSignups.map((s) => s.shiftId);
    const hasOverlap =
      confirmedShiftIds.length > 0 &&
      (await ShiftModel.exists({
        _id: { $in: confirmedShiftIds },
        startTime: { $lt: shift.endTime },
        endTime: { $gt: shift.startTime },
      }));

    if (hasOverlap) continue;

    await SignupModel.findByIdAndUpdate(candidate._id, { status: "confirmed" });
    return;
  }
}

export async function checkIn(id: string) {
  const signup = await SignupModel.findById(id);
  if (!signup) throw new APIError(404, "SignupNotFound", "Signup not found");
  if (signup.status !== "confirmed") {
    throw new APIError(400, "InvalidStatus", "Can only check in confirmed signups");
  }
  if (signup.checkedInAt) {
    throw new APIError(400, "AlreadyCheckedIn", "Volunteer is already checked in");
  }
  signup.checkedInAt = new Date();
  return signup.save();
}

export async function checkOut(id: string) {
  const signup = await SignupModel.findById(id);
  if (!signup) throw new APIError(404, "SignupNotFound", "Signup not found");
  if (!signup.checkedInAt) {
    throw new APIError(400, "NotCheckedIn", "Volunteer has not checked in yet");
  }
  if (signup.checkedOutAt) {
    throw new APIError(400, "AlreadyCheckedOut", "Volunteer is already checked out");
  }
  signup.checkedOutAt = new Date();
  signup.status = "completed";
  return signup.save();
}

export async function updateSignupStatus(id: string, newStatus: SignupStatus) {
  const signup = await SignupModel.findById(id);
  if (!signup) throw new APIError(404, "SignupNotFound", "Signup not found");

  const allowed = VALID_TRANSITIONS[signup.status];
  if (!allowed.includes(newStatus)) {
    throw new APIError(
      400,
      "InvalidStatusTransition",
      `Cannot transition signup from '${signup.status}' to '${newStatus}'`
    );
  }

  if (newStatus === "cancelled") {
    signup.cancelledAt = new Date();
    const wasConfirmed = signup.status === "confirmed";
    signup.status = newStatus;
    await signup.save();
    if (wasConfirmed) await promoteNextWaitlisted(signup.shiftId.toString());
    return signup;
  }

  if (newStatus === "completed") {
    if (!signup.checkedInAt) signup.checkedInAt = new Date();
    signup.checkedOutAt = new Date();
  }

  signup.status = newStatus;
  return signup.save();
}

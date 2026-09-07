import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import { ShiftModel, SHIFT_STATUS, CreateShiftInput, UpdateShiftInput } from "./shift-schemas";
import { LocationModel } from "../location/location-schemas";
import { EventModel } from "../event/event-schemas";
import { SignupModel } from "../signup/signup-schemas";

export async function getAllShifts(
  filters: {
    status?: string;
    eventId?: string;
    locationId?: string;
    skill?: string;
    from?: string;
    to?: string;
  },
  pagination: PaginationInput
) {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.eventId) query.eventId = filters.eventId;
  if (filters.locationId) query.locationId = filters.locationId;
  if (filters.skill) query.requiredSkills = filters.skill;
  if (filters.from || filters.to) {
    query.startTime = {
      ...(filters.from && { $gte: new Date(filters.from) }),
      ...(filters.to && { $lte: new Date(filters.to) }),
    };
  }
  return paginate(ShiftModel, query, { startTime: 1 }, pagination);
}

export async function getShiftById(id: string) {
  const shift = await ShiftModel.findById(id);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Shift not found");
  return shift;
}

export async function getShiftWithCounts(id: string) {
  const shift = await getShiftById(id);
  const waitlistCount = await SignupModel.countDocuments({ shiftId: id, status: "waitlisted" });
  return {
    ...shift.toObject(),
    confirmedCount: shift.currentVolunteers,
    waitlistCount,
    // null spotsAvailable means the shift is uncapped (unlimited)
    spotsAvailable:
      shift.maxVolunteers == null ? null : shift.maxVolunteers - shift.currentVolunteers,
  };
}

// Shared by createShift and createShiftTemplate — both produce Shift documents
// that must satisfy the same location-capacity and event-window constraints.
export async function validateShiftConstraints(data: {
  locationId: string;
  maxVolunteers?: number;
  startTime: Date;
  endTime: Date;
  eventId?: string;
}) {
  const [location, event] = await Promise.all([
    LocationModel.findById(data.locationId),
    data.eventId ? EventModel.findById(data.eventId) : Promise.resolve(null),
  ]);

  if (!location) throw new APIError(404, "LocationNotFound", "Location not found");

  // Skip the capacity check for uncapped shifts (maxVolunteers absent)
  if (location.capacity && data.maxVolunteers != null && data.maxVolunteers > location.capacity) {
    throw new APIError(
      400,
      "ExceedsLocationCapacity",
      `maxVolunteers (${data.maxVolunteers}) exceeds location capacity (${location.capacity})`
    );
  }

  if (data.eventId) {
    if (!event) throw new APIError(404, "EventNotFound", "Event not found");
    if (data.startTime < event.startDate || data.endTime > event.endDate) {
      throw new APIError(
        400,
        "OutsideEventWindow",
        "Shift must start and end within the event's date range"
      );
    }
  }
}

export async function createShift(data: CreateShiftInput) {
  await validateShiftConstraints(data);
  return ShiftModel.create(data);
}

export async function updateShift(id: string, data: UpdateShiftInput) {
  const shift = await getShiftById(id);
  if (shift.status === "cancelled") {
    throw new APIError(400, "ShiftCancelled", "Cannot update a cancelled shift");
  }

  if (data.locationId || data.maxVolunteers !== undefined) {
    const locationId = data.locationId ?? shift.locationId.toString();
    const maxVol = data.maxVolunteers ?? shift.maxVolunteers;
    const location = await LocationModel.findById(locationId);
    if (!location) throw new APIError(404, "LocationNotFound", "Location not found");
    if (location.capacity && maxVol != null && maxVol > location.capacity) {
      throw new APIError(
        400,
        "ExceedsLocationCapacity",
        `maxVolunteers exceeds location capacity (${location.capacity})`
      );
    }
  }

  Object.assign(shift, data);
  // Editing one occurrence of a series detaches it, so later series-wide edits
  // leave this individually-customized shift alone.
  if (shift.templateId) shift.detached = true;
  return shift.save();
}

export async function cancelShift(id: string, cancellationReason?: string, cancelledBy?: string) {
  const shift = await getShiftById(id);
  if (shift.status === "cancelled") {
    throw new APIError(400, "AlreadyCancelled", "Shift is already cancelled");
  }
  shift.status = "cancelled";
  shift.currentVolunteers = 0;
  shift.cancelledAt = new Date();
  if (cancellationReason) shift.cancellationReason = cancellationReason;
  if (cancelledBy) shift.cancelledBy = cancelledBy;
  await shift.save();

  await SignupModel.updateMany(
    { shiftId: id, status: { $in: ["confirmed", "waitlisted"] } },
    {
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: cancellationReason ?? "Shift cancelled",
    }
  );

  return shift;
}

export async function deleteShift(id: string) {
  const shift = await ShiftModel.findByIdAndDelete(id);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Shift not found");
}

export async function getShiftSignups(id: string, pagination: PaginationInput) {
  await getShiftById(id);
  return paginate(SignupModel, { shiftId: id }, { createdAt: 1 }, pagination, "volunteerId");
}

export async function markNoShows(id: string) {
  const shift = await getShiftById(id);
  if (shift.status === SHIFT_STATUS.CANCELLED) {
    throw new APIError(400, "ShiftCancelled", "Cannot mark no-shows on a cancelled shift");
  }
  if (new Date() < shift.endTime) {
    throw new APIError(400, "ShiftNotEnded", "Cannot mark no-shows before the shift has ended");
  }
  const result = await SignupModel.updateMany(
    { shiftId: id, status: "confirmed", checkedInAt: { $exists: false } },
    { status: "no-show" }
  );
  if (result.modifiedCount > 0) {
    await ShiftModel.findByIdAndUpdate(id, { $inc: { currentVolunteers: -result.modifiedCount } });
  }
  return { markedCount: result.modifiedCount };
}

import { APIError } from "../../common/errors";
import { ShiftModel, CreateShiftInput, UpdateShiftInput } from "./shift-schemas";
import { LocationModel } from "../location/location-schemas";
import { EventModel } from "../event/event-schemas";
import { SignupModel } from "../signup/signup-schemas";

export async function getAllShifts(filters: {
  status?: string;
  eventId?: string;
  locationId?: string;
  from?: string;
  to?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.eventId) query.eventId = filters.eventId;
  if (filters.locationId) query.locationId = filters.locationId;
  if (filters.from || filters.to) {
    query.startTime = {};
    if (filters.from) (query.startTime as Record<string, unknown>).$gte = new Date(filters.from);
    if (filters.to) (query.startTime as Record<string, unknown>).$lte = new Date(filters.to);
  }
  return ShiftModel.find(query).sort({ startTime: 1 });
}

export async function getShiftById(id: string) {
  const shift = await ShiftModel.findById(id);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Shift not found");
  return shift;
}

export async function getShiftWithCounts(id: string) {
  const shift = await getShiftById(id);
  const confirmedCount = await SignupModel.countDocuments({ shiftId: id, status: "confirmed" });
  const waitlistCount = await SignupModel.countDocuments({ shiftId: id, status: "waitlisted" });
  return { ...shift.toObject(), confirmedCount, waitlistCount, spotsAvailable: shift.maxVolunteers - confirmedCount };
}

export async function createShift(data: CreateShiftInput) {
  const location = await LocationModel.findById(data.locationId);
  if (!location) throw new APIError(404, "LocationNotFound", "Location not found");

  if (location.capacity && data.maxVolunteers > location.capacity) {
    throw new APIError(
      400,
      "ExceedsLocationCapacity",
      `maxVolunteers (${data.maxVolunteers}) exceeds location capacity (${location.capacity})`
    );
  }

  if (data.eventId) {
    const event = await EventModel.findById(data.eventId);
    if (!event) throw new APIError(404, "EventNotFound", "Event not found");
    if (data.startTime < event.startDate || data.startTime > event.endDate) {
      throw new APIError(400, "OutsideEventWindow", "Shift startTime falls outside the event's date range");
    }
  }

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
    if (location.capacity && maxVol > location.capacity) {
      throw new APIError(400, "ExceedsLocationCapacity", `maxVolunteers exceeds location capacity (${location.capacity})`);
    }
  }

  Object.assign(shift, data);
  return shift.save();
}

export async function cancelShift(id: string) {
  const shift = await getShiftById(id);
  if (shift.status === "cancelled") {
    throw new APIError(400, "AlreadyCancelled", "Shift is already cancelled");
  }
  shift.status = "cancelled";
  await shift.save();

  await SignupModel.updateMany(
    { shiftId: id, status: { $in: ["confirmed", "waitlisted"] } },
    { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Shift cancelled" }
  );

  return shift;
}

export async function deleteShift(id: string) {
  const shift = await ShiftModel.findByIdAndDelete(id);
  if (!shift) throw new APIError(404, "ShiftNotFound", "Shift not found");
}

export async function getShiftSignups(id: string) {
  await getShiftById(id);
  return SignupModel.find({ shiftId: id })
    .populate("volunteerId")
    .sort({ createdAt: 1 });
}

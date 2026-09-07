import { APIError } from "../../common/errors";
import { paginate, PaginationInput } from "../../common/paginate";
import { EventModel, EVENT_STATUS, CreateEventInput, UpdateEventInput } from "./event-schemas";
import { ShiftModel } from "../shift/shift-schemas";
import { SignupModel } from "../signup/signup-schemas";
import { HostModel } from "../host/host-schemas";

async function assertHostExists(hostId: string) {
  const host = await HostModel.findById(hostId);
  if (!host) throw new APIError(404, "HostNotFound", "Host not found");
}

// Move any published event whose endDate has passed into "completed".
// Lazy sweep run on reads (no scheduler); a cron could call this directly too.
export async function completeExpiredEvents() {
  await EventModel.updateMany(
    { status: EVENT_STATUS.PUBLISHED, endDate: { $lt: new Date() } },
    { status: EVENT_STATUS.COMPLETED }
  );
}

export async function getAllEvents(pagination: PaginationInput, status?: string) {
  await completeExpiredEvents();
  const filter = status ? { status } : {};
  return paginate(EventModel, filter, { startDate: 1 }, pagination);
}

export async function getEventById(id: string) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
  if (event.status === EVENT_STATUS.PUBLISHED && event.endDate < new Date()) {
    event.status = EVENT_STATUS.COMPLETED;
    await event.save();
  }
  return event;
}

export async function createEvent(data: CreateEventInput) {
  await assertHostExists(data.hostId);
  return EventModel.create(data);
}

export async function updateEvent(id: string, data: UpdateEventInput) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");

  if (data.hostId) await assertHostExists(data.hostId);

  const startDate = data.startDate ?? event.startDate;
  const endDate = data.endDate ?? event.endDate;
  if (endDate <= startDate) {
    throw new APIError(400, "InvalidDates", "endDate must be after startDate");
  }

  Object.assign(event, data);
  return event.save();
}

export async function cancelEvent(id: string, cancellationReason?: string, cancelledBy?: string) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
  if (event.status === "cancelled") {
    throw new APIError(400, "AlreadyCancelled", "Event is already cancelled");
  }
  event.status = "cancelled";
  event.cancelledAt = new Date();
  if (cancellationReason) event.cancellationReason = cancellationReason;
  if (cancelledBy) event.cancelledBy = cancelledBy;
  await event.save();

  // Cascade: cancel the event's shifts and their signups
  const reason = cancellationReason ?? "Event cancelled";
  const shifts = await ShiftModel.find({ eventId: id, status: { $ne: "cancelled" } }).select("_id");
  const shiftIds = shifts.map((s) => s._id);
  if (shiftIds.length > 0) {
    const shiftUpdate: Record<string, unknown> = {
      status: "cancelled",
      currentVolunteers: 0,
      cancelledAt: new Date(),
      cancellationReason: reason,
    };
    if (cancelledBy) shiftUpdate.cancelledBy = cancelledBy;
    await ShiftModel.updateMany({ _id: { $in: shiftIds } }, shiftUpdate);
    await SignupModel.updateMany(
      { shiftId: { $in: shiftIds }, status: { $in: ["confirmed", "waitlisted"] } },
      { status: "cancelled", cancelledAt: new Date(), cancellationReason: reason }
    );
  }

  return event;
}

export async function deleteEvent(id: string) {
  const event = await EventModel.findByIdAndDelete(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
}

export async function getEventSummary(id: string) {
  await getEventById(id);

  const shifts = await ShiftModel.find({ eventId: id });
  const shiftIds = shifts.map((s) => s._id);

  // Fill rate is only meaningful for capped shifts — uncapped shifts have no
  // finite capacity, so they're excluded from both sides of the ratio.
  const cappedShifts = shifts.filter((s) => s.maxVolunteers != null);
  const totalCapacity = cappedShifts.reduce((sum, s) => sum + (s.maxVolunteers ?? 0), 0);
  const confirmedOnCapped = cappedShifts.reduce((sum, s) => sum + s.currentVolunteers, 0);

  const statusCounts: { _id: string; count: number }[] = await SignupModel.aggregate([
    { $match: { shiftId: { $in: shiftIds } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const hoursAgg: { totalHours: number }[] = await SignupModel.aggregate([
    {
      $match: {
        shiftId: { $in: shiftIds },
        status: "completed",
        checkedInAt: { $exists: true },
        checkedOutAt: { $exists: true },
      },
    },
    {
      $project: {
        hours: { $divide: [{ $subtract: ["$checkedOutAt", "$checkedInAt"] }, 3600000] },
      },
    },
    { $group: { _id: null, totalHours: { $sum: "$hours" } } },
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const confirmed = byStatus["confirmed"] ?? 0;

  return {
    eventId: id,
    totalShifts: shifts.length,
    totalCapacity,
    // fillRate uses confirmedOnCapped (capped shifts only), a different source
    // than signups.confirmed below (all shifts) — intended, different metrics.
    fillRate:
      totalCapacity > 0 ? Math.round((confirmedOnCapped / totalCapacity) * 1000) / 1000 : 0,
    signups: {
      confirmed,
      waitlisted: byStatus["waitlisted"] ?? 0,
      cancelled: byStatus["cancelled"] ?? 0,
      noShow: byStatus["no-show"] ?? 0,
      completed: byStatus["completed"] ?? 0,
    },
    totalVolunteerHours: Math.round((hoursAgg[0]?.totalHours ?? 0) * 100) / 100,
  };
}

export async function getEventShifts(
  id: string,
  pagination: PaginationInput,
  status?: string
) {
  await getEventById(id);
  const filter: Record<string, unknown> = { eventId: id };
  if (status) filter.status = status;
  return paginate(ShiftModel, filter, { startTime: 1 }, pagination);
}

import { APIError } from "../../common/errors";
import { EventModel, CreateEventInput, UpdateEventInput } from "./event-schemas";

export async function getAllEvents(status?: string) {
  const filter = status ? { status } : {};
  return EventModel.find(filter).sort({ startDate: 1 });
}

export async function getEventById(id: string) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
  return event;
}

export async function createEvent(data: CreateEventInput) {
  return EventModel.create(data);
}

export async function updateEvent(id: string, data: UpdateEventInput) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");

  const startDate = data.startDate ?? event.startDate;
  const endDate = data.endDate ?? event.endDate;
  if (endDate <= startDate) {
    throw new APIError(400, "InvalidDates", "endDate must be after startDate");
  }

  Object.assign(event, data);
  return event.save();
}

export async function cancelEvent(id: string) {
  const event = await EventModel.findById(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
  if (event.status === "cancelled") {
    throw new APIError(400, "AlreadyCancelled", "Event is already cancelled");
  }
  event.status = "cancelled";
  return event.save();
}

export async function deleteEvent(id: string) {
  const event = await EventModel.findByIdAndDelete(id);
  if (!event) throw new APIError(404, "EventNotFound", "Event not found");
}

import { get, post, put, del } from "../../common/testTools";
import { EVENT_STATUS } from "./event-schemas";
import { SHIFT_STATUS } from "../shift/shift-schemas";
import { SIGNUP_STATUS } from "../signup/signup-schemas";

let hostId: string;

beforeEach(async () => {
  const host = await post("/hosts").send({
    companyName: "Helping Hands Inc",
    contact: { name: "Pat Organizer", email: "pat@helpinghands.org", phone: "555-0100" },
    createdBy: "admin",
  });
  hostId = host.body._id;
});

const baseEvent = () => ({
  name: "Fall Food Drive",
  hostId,
  startDate: "2026-10-01T00:00:00Z",
  endDate: "2026-10-31T23:59:59Z",
  createdBy: "admin",
});

describe("GET /events", () => {
  it("returns empty array initially", async () => {
    const res = await get("/events");
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it("filters by status", async () => {
    await post("/events").send(baseEvent());
    await post("/events").send({ ...baseEvent(), name: "Event 2", status: EVENT_STATUS.PUBLISHED });
    const res = await get("/events?status=published");
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].status).toBe(EVENT_STATUS.PUBLISHED);
  });
});

describe("POST /events", () => {
  it("creates an event with default draft status", async () => {
    const res = await post("/events").send(baseEvent());
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Fall Food Drive");
    expect(res.body.hostId).toBe(hostId);
    expect(res.body.status).toBe(EVENT_STATUS.DRAFT);
  });

  it("rejects when hostId is missing", async () => {
    const { hostId: _omit, ...noHost } = baseEvent();
    const res = await post("/events").send(noHost);
    expect(res.status).toBe(400);
  });

  it("rejects when the host does not exist", async () => {
    const res = await post("/events").send({
      ...baseEvent(),
      hostId: "000000000000000000000000",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("HostNotFound");
  });

  it("rejects when endDate is before startDate", async () => {
    const res = await post("/events").send({
      ...baseEvent(),
      startDate: "2026-10-31T00:00:00Z",
      endDate: "2026-10-01T00:00:00Z",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const res = await post("/events").send({ name: "Incomplete" });
    expect(res.status).toBe(400);
  });
});

describe("GET /events/:id", () => {
  it("returns an event by id", async () => {
    const created = await post("/events").send(baseEvent());
    const res = await get(`/events/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Fall Food Drive");
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/events/000000000000000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("EventNotFound");
  });
});

describe("PUT /events/:id/cancel", () => {
  it("cancels an event", async () => {
    const created = await post("/events").send(baseEvent());
    const res = await put(`/events/${created.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(EVENT_STATUS.CANCELLED);
    expect(res.body.cancelledAt).toBeDefined();
  });

  it("records cancellation reason and who cancelled", async () => {
    const created = await post("/events").send(baseEvent());
    const res = await put(`/events/${created.body._id}/cancel`).send({
      cancellationReason: "Venue flooded",
      cancelledBy: "organizer",
    });
    expect(res.status).toBe(200);
    expect(res.body.cancellationReason).toBe("Venue flooded");
    expect(res.body.cancelledBy).toBe("organizer");
  });

  it("rejects double cancel", async () => {
    const created = await post("/events").send(baseEvent());
    await put(`/events/${created.body._id}/cancel`);
    const res = await put(`/events/${created.body._id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("AlreadyCancelled");
  });

  it("cascade cancels the event's shifts and their signups", async () => {
    const loc = await post("/locations").send({
      name: "Cascade Hall",
      address: "123 Test St",
      createdBy: "admin",
    });
    const event = await post("/events").send(baseEvent());
    const shift = await post("/shifts").send({
      title: "Cascade Shift",
      locationId: loc.body._id,
      eventId: event.body._id,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 3,
      status: SHIFT_STATUS.PUBLISHED,
      createdBy: "admin",
    });
    const vol = await post("/volunteers").send({
      firstName: "Cas",
      lastName: "Cade",
      address: "123 Test St",
      dateOfBirth: "1990-01-01",
      email: "cascade@example.com",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });
    const signup = await post("/signups").send({
      volunteerId: vol.body._id,
      shiftId: shift.body._id,
      createdBy: "admin",
    });

    await put(`/events/${event.body._id}/cancel`).send({ cancellationReason: "Rained out" });

    const shiftCheck = await get(`/shifts/${shift.body._id}`);
    expect(shiftCheck.body.status).toBe(SHIFT_STATUS.CANCELLED);
    const signupCheck = await get(`/signups/${signup.body._id}`);
    expect(signupCheck.body.status).toBe(SIGNUP_STATUS.CANCELLED);
  });

  it("allows cancelling an event that has already completed", async () => {
    const created = await post("/events").send({
      name: "Done Event",
      hostId,
      startDate: "2020-01-01T00:00:00Z",
      endDate: "2020-12-31T00:00:00Z",
      status: "published",
      createdBy: "admin",
    });
    await get(`/events/${created.body._id}`); // triggers auto-completion
    const res = await put(`/events/${created.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(EVENT_STATUS.CANCELLED);
  });
});

describe("Event auto-completion", () => {
  it("auto-completes a published event whose endDate has passed", async () => {
    const created = await post("/events").send({
      name: "Past Event",
      hostId,
      startDate: "2020-01-01T00:00:00Z",
      endDate: "2020-12-31T00:00:00Z",
      status: "published",
      createdBy: "admin",
    });
    const res = await get(`/events/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(EVENT_STATUS.COMPLETED);
  });
});

describe("GET /events/:id/summary", () => {
  it("returns zero stats for an event with no shifts", async () => {
    const event = await post("/events").send(baseEvent());
    const res = await get(`/events/${event.body._id}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.totalShifts).toBe(0);
    expect(res.body.totalCapacity).toBe(0);
    expect(res.body.fillRate).toBe(0);
    expect(res.body.signups.confirmed).toBe(0);
    expect(res.body.totalVolunteerHours).toBe(0);
  });

  it("counts confirmed signups and fill rate", async () => {
    const loc = await post("/locations").send({ name: "Summary Hall", address: "123 Test St", createdBy: "admin" });
    const event = await post("/events").send(baseEvent());
    const locId = loc.body._id;
    const eventId = event.body._id;

    const shift = await post("/shifts").send({
      title: "Summary Shift",
      locationId: locId,
      eventId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 4,
      status: SHIFT_STATUS.PUBLISHED,
      createdBy: "admin",
    });

    const vol = await post("/volunteers").send({
      firstName: "Sum",
      lastName: "Mary",
      email: "summary@example.com",
      address: "123 Test St",
      dateOfBirth: "1990-01-01",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });
    await post("/signups").send({ volunteerId: vol.body._id, shiftId: shift.body._id, createdBy: "admin" });

    const res = await get(`/events/${eventId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.totalShifts).toBe(1);
    expect(res.body.totalCapacity).toBe(4);
    expect(res.body.signups.confirmed).toBe(1);
    expect(res.body.fillRate).toBe(0.25);
  });

  it("returns 404 for unknown event", async () => {
    const res = await get("/events/000000000000000000000000/summary");
    expect(res.status).toBe(404);
  });
});

describe("GET /events/:id/shifts", () => {
  it("returns shifts belonging to an event", async () => {
    const loc = await post("/locations").send({ name: "Event Hall", address: "123 Test St", createdBy: "admin" });
    const locId = loc.body._id;
    const event = await post("/events").send(baseEvent());
    const eventId = event.body._id;

    await post("/shifts").send({
      title: "Shift A",
      locationId: locId,
      eventId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 3,
      status: SHIFT_STATUS.PUBLISHED,
      createdBy: "admin",
    });
    await post("/shifts").send({
      title: "Shift B",
      locationId: locId,
      startTime: "2026-10-10T13:00:00Z",
      endTime: "2026-10-10T16:00:00Z",
      maxVolunteers: 3,
      status: SHIFT_STATUS.PUBLISHED,
      createdBy: "admin",
    });

    const res = await get(`/events/${eventId}/shifts`);
    expect(res.status).toBe(200);
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].title).toBe("Shift A");
    expect(res.body.pagination).toBeDefined();
  });

  it("returns 404 for unknown event", async () => {
    const res = await get("/events/000000000000000000000000/shifts");
    expect(res.status).toBe(404);
  });

  it("filters event shifts by status", async () => {
    const loc = await post("/locations").send({ name: "Status Hall", address: "123 Test St", createdBy: "admin" });
    const event = await post("/events").send(baseEvent());
    const locId = loc.body._id;
    const eventId = event.body._id;

    await post("/shifts").send({
      title: "Published Shift",
      locationId: locId,
      eventId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 3,
      status: SHIFT_STATUS.PUBLISHED,
      createdBy: "admin",
    });
    await post("/shifts").send({
      title: "Draft Shift",
      locationId: locId,
      eventId,
      startTime: "2026-10-11T09:00:00Z",
      endTime: "2026-10-11T12:00:00Z",
      maxVolunteers: 3,
      status: SHIFT_STATUS.DRAFT,
      createdBy: "admin",
    });

    const res = await get(`/events/${eventId}/shifts?status=published`);
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].status).toBe(SHIFT_STATUS.PUBLISHED);
  });
});

describe("DELETE /events/:id", () => {
  it("deletes an event", async () => {
    const created = await post("/events").send(baseEvent());
    const res = await del(`/events/${created.body._id}`);
    expect(res.status).toBe(204);
    const check = await get(`/events/${created.body._id}`);
    expect(check.status).toBe(404);
  });
});

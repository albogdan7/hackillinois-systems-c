import { get, post, put, del } from "../../common/testTools";

const BASE_EVENT = {
  name: "Fall Food Drive",
  startDate: "2026-10-01T00:00:00Z",
  endDate: "2026-10-31T23:59:59Z",
  createdBy: "admin",
};

describe("GET /events", () => {
  it("returns empty array initially", async () => {
    const res = await get("/events");
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it("filters by status", async () => {
    await post("/events").send(BASE_EVENT);
    await post("/events").send({ ...BASE_EVENT, name: "Event 2", status: "published" });
    const res = await get("/events?status=published");
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].status).toBe("published");
  });
});

describe("POST /events", () => {
  it("creates an event with default draft status", async () => {
    const res = await post("/events").send(BASE_EVENT);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Fall Food Drive");
    expect(res.body.status).toBe("draft");
  });

  it("rejects when endDate is before startDate", async () => {
    const res = await post("/events").send({
      ...BASE_EVENT,
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
    const created = await post("/events").send(BASE_EVENT);
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
    const created = await post("/events").send(BASE_EVENT);
    const res = await put(`/events/${created.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("rejects double cancel", async () => {
    const created = await post("/events").send(BASE_EVENT);
    await put(`/events/${created.body._id}/cancel`);
    const res = await put(`/events/${created.body._id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("AlreadyCancelled");
  });
});

describe("GET /events/:id/shifts", () => {
  it("returns shifts belonging to an event", async () => {
    const loc = await post("/locations").send({ name: "Event Hall" });
    const locId = loc.body._id;
    const event = await post("/events").send(BASE_EVENT);
    const eventId = event.body._id;

    await post("/shifts").send({
      title: "Shift A",
      locationId: locId,
      eventId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 3,
      status: "published",
      createdBy: "admin",
    });
    await post("/shifts").send({
      title: "Shift B",
      locationId: locId,
      startTime: "2026-10-10T13:00:00Z",
      endTime: "2026-10-10T16:00:00Z",
      maxVolunteers: 3,
      status: "published",
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
    const loc = await post("/locations").send({ name: "Status Hall" });
    const event = await post("/events").send(BASE_EVENT);
    const locId = loc.body._id;
    const eventId = event.body._id;

    await post("/shifts").send({
      title: "Published Shift",
      locationId: locId,
      eventId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 3,
      status: "published",
      createdBy: "admin",
    });
    await post("/shifts").send({
      title: "Draft Shift",
      locationId: locId,
      eventId,
      startTime: "2026-10-11T09:00:00Z",
      endTime: "2026-10-11T12:00:00Z",
      maxVolunteers: 3,
      status: "draft",
      createdBy: "admin",
    });

    const res = await get(`/events/${eventId}/shifts?status=published`);
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].status).toBe("published");
  });
});

describe("DELETE /events/:id", () => {
  it("deletes an event", async () => {
    const created = await post("/events").send(BASE_EVENT);
    const res = await del(`/events/${created.body._id}`);
    expect(res.status).toBe(204);
    const check = await get(`/events/${created.body._id}`);
    expect(check.status).toBe(404);
  });
});

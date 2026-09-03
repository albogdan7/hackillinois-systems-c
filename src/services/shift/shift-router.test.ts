import { get, post, put, del } from "../../common/testTools";

async function makeLocation() {
  const res = await post("/locations").send({ name: "Test Hall", capacity: 50 });
  return res.body._id as string;
}

async function makeShift(locationId: string, overrides = {}) {
  const res = await post("/shifts").send({
    title: "Registration Desk",
    locationId,
    startTime: "2026-10-10T09:00:00Z",
    endTime: "2026-10-10T12:00:00Z",
    maxVolunteers: 5,
    status: "published",
    createdBy: "admin",
    ...overrides,
  });
  return res;
}

describe("GET /shifts", () => {
  it("returns empty array initially", async () => {
    const res = await get("/shifts");
    expect(res.status).toBe(200);
    expect(res.body.shifts).toEqual([]);
  });

  it("filters by status", async () => {
    const locId = await makeLocation();
    await makeShift(locId, { status: "draft" });
    await makeShift(locId, { title: "Shift 2", status: "published" });
    const res = await get("/shifts?status=published");
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].status).toBe("published");
  });
});

describe("POST /shifts", () => {
  it("creates a shift", async () => {
    const locId = await makeLocation();
    const res = await makeShift(locId);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Registration Desk");
  });

  it("rejects endTime before startTime", async () => {
    const locId = await makeLocation();
    const res = await post("/shifts").send({
      title: "Bad Shift",
      locationId: locId,
      startTime: "2026-10-10T12:00:00Z",
      endTime: "2026-10-10T09:00:00Z",
      maxVolunteers: 5,
      createdBy: "admin",
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown location", async () => {
    const res = await post("/shifts").send({
      title: "Shift",
      locationId: "000000000000000000000000",
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 5,
      createdBy: "admin",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("LocationNotFound");
  });

  it("rejects maxVolunteers exceeding location capacity", async () => {
    const locId = await makeLocation(); // capacity 50
    const res = await post("/shifts").send({
      title: "Huge Shift",
      locationId: locId,
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
      maxVolunteers: 100,
      createdBy: "admin",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ExceedsLocationCapacity");
  });
});

describe("GET /shifts/:id", () => {
  it("returns shift with signup counts", async () => {
    const locId = await makeLocation();
    const shift = await makeShift(locId);
    const res = await get(`/shifts/${shift.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.confirmedCount).toBe(0);
    expect(res.body.spotsAvailable).toBe(5);
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/shifts/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

describe("PUT /shifts/:id/cancel", () => {
  it("cancels a shift", async () => {
    const locId = await makeLocation();
    const shift = await makeShift(locId);
    const res = await put(`/shifts/${shift.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("rejects double cancel", async () => {
    const locId = await makeLocation();
    const shift = await makeShift(locId);
    await put(`/shifts/${shift.body._id}/cancel`);
    const res = await put(`/shifts/${shift.body._id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("AlreadyCancelled");
  });
});

describe("DELETE /shifts/:id", () => {
  it("deletes a shift", async () => {
    const locId = await makeLocation();
    const shift = await makeShift(locId);
    const res = await del(`/shifts/${shift.body._id}`);
    expect(res.status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const res = await del("/shifts/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

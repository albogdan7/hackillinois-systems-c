import { get, post, put, del } from "../../common/testTools";
import { SHIFT_STATUS } from "./shift-schemas";
import { SIGNUP_STATUS } from "../signup/signup-schemas";

async function makeLocation() {
  const res = await post("/locations").send({ name: "Test Hall", capacity: 50, address: "123 Test St", createdBy: "admin" });
  return res.body._id as string;
}

async function makeShift(locationId: string, overrides = {}) {
  const res = await post("/shifts").send({
    title: "Registration Desk",
    locationId,
    startTime: "2026-10-10T09:00:00Z",
    endTime: "2026-10-10T12:00:00Z",
    maxVolunteers: 5,
    status: SHIFT_STATUS.PUBLISHED,
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
    await makeShift(locId, { status: SHIFT_STATUS.DRAFT });
    await makeShift(locId, { title: "Shift 2", status: SHIFT_STATUS.PUBLISHED });
    const res = await get("/shifts?status=published");
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].status).toBe(SHIFT_STATUS.PUBLISHED);
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
    expect(res.body.status).toBe(SHIFT_STATUS.CANCELLED);
    expect(res.body.cancelledAt).toBeDefined();
  });

  it("records cancellation reason and who cancelled", async () => {
    const locId = await makeLocation();
    const shift = await makeShift(locId);
    const res = await put(`/shifts/${shift.body._id}/cancel`).send({
      cancellationReason: "Weather",
      cancelledBy: "coordinator",
    });
    expect(res.status).toBe(200);
    expect(res.body.cancellationReason).toBe("Weather");
    expect(res.body.cancelledBy).toBe("coordinator");
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

describe("GET /shifts?skill=", () => {
  it("filters shifts by required skill", async () => {
    const locId = await makeLocation();
    await makeShift(locId, { requiredSkills: ["first-aid"] });
    await makeShift(locId, { title: "No Skill Shift" });

    const res = await get("/shifts?skill=first-aid");
    expect(res.status).toBe(200);
    expect(res.body.shifts).toHaveLength(1);
    expect(res.body.shifts[0].requiredSkills).toContain("first-aid");
  });

  it("returns empty when no shifts match skill", async () => {
    const locId = await makeLocation();
    await makeShift(locId);
    const res = await get("/shifts?skill=driving");
    expect(res.body.shifts).toHaveLength(0);
  });
});

describe("PUT /shifts/:id/mark-noshows", () => {
  it("marks confirmed signups without checkin as no-show after shift ends", async () => {
    const locId = await makeLocation();
    const shiftRes = await makeShift(locId, {
      startTime: "2020-01-01T09:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
    });
    const shiftId = shiftRes.body._id as string;

    const vol1 = await post("/volunteers").send({
      firstName: "A",
      lastName: "B",
      email: "ns1@example.com",
      address: "123 Test St",
      dateOfBirth: "1990-01-01",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });
    const vol2 = await post("/volunteers").send({
      firstName: "C",
      lastName: "D",
      email: "ns2@example.com",
      address: "123 Test St",
      dateOfBirth: "1990-01-01",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });

    const s1 = await post("/signups").send({ volunteerId: vol1.body._id, shiftId, createdBy: "admin" });
    const s2 = await post("/signups").send({ volunteerId: vol2.body._id, shiftId, createdBy: "admin" });

    await put(`/signups/${s1.body._id}/checkin`);

    const res = await put(`/shifts/${shiftId}/mark-noshows`);
    expect(res.status).toBe(200);
    expect(res.body.markedCount).toBe(1);

    const checked = await get(`/signups/${s2.body._id}`);
    expect(checked.body.status).toBe(SIGNUP_STATUS.NO_SHOW);

    const checkedIn = await get(`/signups/${s1.body._id}`);
    expect(checkedIn.body.status).toBe(SIGNUP_STATUS.CONFIRMED);
  });

  it("rejects mark-noshows if shift has not ended", async () => {
    const locId = await makeLocation();
    const shiftRes = await makeShift(locId);
    const res = await put(`/shifts/${shiftRes.body._id}/mark-noshows`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ShiftNotEnded");
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

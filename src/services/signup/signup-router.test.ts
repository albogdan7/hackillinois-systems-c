import { get, post, put } from "../../common/testTools";
import { SIGNUP_STATUS } from "./signup-schemas";
import { SHIFT_STATUS, ShiftModel } from "../shift/shift-schemas";

async function makeLocation() {
  const res = await post("/locations").send({ name: "Signup Hall", capacity: 50, address: "123 Test St", createdBy: "admin" });
  return res.body._id as string;
}

let volunteerSeq = 0;
async function makeVolunteer(email?: string, skills: string[] = []) {
  const res = await post("/volunteers").send({
    firstName: "Test",
    lastName: "Volunteer",
    address: "123 Test St",
    dateOfBirth: "1990-01-01",
    email: email ?? `vol${++volunteerSeq}@example.com`,
    phone: "555-0100",
    skills,
    emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
    createdBy: "admin",
  });
  return res.body._id as string;
}

async function makeShift(locationId: string, overrides = {}) {
  const res = await post("/shifts").send({
    title: "Test Shift",
    locationId,
    startTime: "2026-10-10T09:00:00Z",
    endTime: "2026-10-10T12:00:00Z",
    maxVolunteers: 2,
    status: SHIFT_STATUS.PUBLISHED,
    createdBy: "admin",
    ...overrides,
  });
  return res.body._id as string;
}

describe("POST /signups — basic", () => {
  it("creates a confirmed signup when capacity is available", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe(SIGNUP_STATUS.CONFIRMED);
  });

  it("never waitlists on an uncapped shift (no maxVolunteers)", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { maxVolunteers: undefined });

    for (const email of ["u1@example.com", "u2@example.com", "u3@example.com"]) {
      const volId = await makeVolunteer(email);
      const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe(SIGNUP_STATUS.CONFIRMED);
    }
  });

  it("creates a waitlisted signup when shift is at capacity", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { maxVolunteers: 1 });

    const vol1 = await makeVolunteer("v1@example.com");
    const vol2 = await makeVolunteer("v2@example.com");

    await post("/signups").send({ volunteerId: vol1, shiftId, createdBy: "admin" });
    const res = await post("/signups").send({ volunteerId: vol2, shiftId, createdBy: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe(SIGNUP_STATUS.WAITLISTED);
  });

  it("rejects duplicate signup for same shift", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AlreadySignedUp");
  });

  it("rejects signup for non-published shift", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId, { status: SHIFT_STATUS.DRAFT });

    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ShiftNotAvailable");
  });

  it("rejects signup for non-existent volunteer", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    const res = await post("/signups").send({
      volunteerId: "000000000000000000000000",
      shiftId,
      createdBy: "admin",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VolunteerNotFound");
  });

  it("rejects signup for non-existent shift", async () => {
    const volId = await makeVolunteer();
    const res = await post("/signups").send({
      volunteerId: volId,
      shiftId: "000000000000000000000000",
      createdBy: "admin",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ShiftNotFound");
  });
});

describe("POST /signups — skill matching", () => {
  it("allows signup when volunteer has all required skills", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer("skilled@example.com", ["first-aid", "driving"]);
    const shiftId = await makeShift(locId, { requiredSkills: ["first-aid"] });

    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(201);
  });

  it("rejects signup when volunteer is missing required skills", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer("unskilled@example.com", ["driving"]);
    const shiftId = await makeShift(locId, { requiredSkills: ["first-aid"] });

    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("InsufficientSkills");
  });
});

describe("POST /signups — age gate", () => {
  it("rejects a volunteer under the shift minAge", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { minAge: 21 });
    const vol = await post("/volunteers").send({
      firstName: "Kid",
      lastName: "Young",
      address: "123 Test St",
      dateOfBirth: "2015-01-01",
      email: "kid@example.com",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });
    const res = await post("/signups").send({
      volunteerId: vol.body._id,
      shiftId,
      createdBy: "admin",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UnderageForShift");
  });

  it("allows a volunteer who meets the shift minAge", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { minAge: 18 });
    const volId = await makeVolunteer("adult@example.com");
    const res = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    expect(res.status).toBe(201);
  });
});

describe("POST /signups — overlap detection", () => {
  it("rejects signup for overlapping confirmed shift", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();

    const shift1 = await makeShift(locId, {
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
    });
    const shift2 = await makeShift(locId, {
      title: "Overlapping Shift",
      startTime: "2026-10-10T11:00:00Z",
      endTime: "2026-10-10T14:00:00Z",
    });

    await post("/signups").send({ volunteerId: volId, shiftId: shift1, createdBy: "admin" });
    const res = await post("/signups").send({ volunteerId: volId, shiftId: shift2, createdBy: "admin" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ShiftOverlap");
  });

  it("allows signup for adjacent non-overlapping shifts", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();

    const shift1 = await makeShift(locId, {
      startTime: "2026-10-10T09:00:00Z",
      endTime: "2026-10-10T12:00:00Z",
    });
    const shift2 = await makeShift(locId, {
      title: "Adjacent Shift",
      startTime: "2026-10-10T12:00:00Z",
      endTime: "2026-10-10T15:00:00Z",
    });

    await post("/signups").send({ volunteerId: volId, shiftId: shift1, createdBy: "admin" });
    const res = await post("/signups").send({ volunteerId: volId, shiftId: shift2, createdBy: "admin" });
    expect(res.status).toBe(201);
  });
});

describe("PUT /signups/:id/cancel", () => {
  it("cancels a signup", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    const res = await put(`/signups/${signup.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(SIGNUP_STATUS.CANCELLED);
    expect(res.body.cancelledAt).toBeDefined();
  });

  it("cancels with a reason", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    const res = await put(`/signups/${signup.body._id}/cancel`).send({
      cancellationReason: "Family emergency",
    });
    expect(res.body.cancellationReason).toBe("Family emergency");
  });

  it("promotes waitlisted volunteer when confirmed cancels", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { maxVolunteers: 1 });

    const vol1 = await makeVolunteer("v1@example.com");
    const vol2 = await makeVolunteer("v2@example.com");

    const s1 = await post("/signups").send({ volunteerId: vol1, shiftId, createdBy: "admin" });
    const s2 = await post("/signups").send({ volunteerId: vol2, shiftId, createdBy: "admin" });

    expect(s1.body.status).toBe(SIGNUP_STATUS.CONFIRMED);
    expect(s2.body.status).toBe(SIGNUP_STATUS.WAITLISTED);

    await put(`/signups/${s1.body._id}/cancel`);

    const promoted = await get(`/signups/${s2.body._id}`);
    expect(promoted.body.status).toBe(SIGNUP_STATUS.CONFIRMED);
  });

  it("rejects cancelling an already cancelled signup", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    await put(`/signups/${signup.body._id}/cancel`);
    const res = await put(`/signups/${signup.body._id}/cancel`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("InvalidStatusTransition");
  });
});

describe("PUT /signups/:id/checkin and checkout", () => {
  it("checks in a volunteer", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    const res = await put(`/signups/${signup.body._id}/checkin`);
    expect(res.status).toBe(200);
    expect(res.body.checkedInAt).toBeDefined();
  });

  it("rejects checkout before checkin", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    const res = await put(`/signups/${signup.body._id}/checkout`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("NotCheckedIn");
  });

  it("checks out and marks completed", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    await put(`/signups/${signup.body._id}/checkin`);
    const res = await put(`/signups/${signup.body._id}/checkout`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(SIGNUP_STATUS.COMPLETED);
    expect(res.body.checkedOutAt).toBeDefined();
  });
});

describe("Shift cancellation cascade", () => {
  it("cancels all signups when shift is cancelled", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId, { maxVolunteers: 3 });

    const vol1 = await makeVolunteer("c1@example.com");
    const vol2 = await makeVolunteer("c2@example.com");

    const s1 = await post("/signups").send({ volunteerId: vol1, shiftId, createdBy: "admin" });
    const s2 = await post("/signups").send({ volunteerId: vol2, shiftId, createdBy: "admin" });

    await put(`/shifts/${shiftId}/cancel`);

    const check1 = await get(`/signups/${s1.body._id}`);
    const check2 = await get(`/signups/${s2.body._id}`);
    expect(check1.body.status).toBe(SIGNUP_STATUS.CANCELLED);
    expect(check2.body.status).toBe(SIGNUP_STATUS.CANCELLED);
  });
});

describe("POST /signups — materialize a recurrence occurrence", () => {
  async function makeTemplate(locationId: string, overrides = {}) {
    const res = await post("/shift-templates").send({
      title: "Weekly Desk",
      locationId,
      startTime: "2026-10-06T09:00:00Z",
      endTime: "2026-10-06T12:00:00Z",
      maxVolunteers: 2,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3], occurrences: 4 },
      createdBy: "admin",
      ...overrides,
    });
    return res.body._id as string;
  }

  it("materializes a shift on first signup to a virtual occurrence", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const templateId = await makeTemplate(locId);

    const res = await post("/signups").send({
      volunteerId: volId,
      templateId,
      recurrenceId: "2026-10-07T09:00:00Z",
      createdBy: "admin",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe(SIGNUP_STATUS.CONFIRMED);

    // A concrete shift now exists for that slot, at the right instant.
    const shifts = await ShiftModel.find({ templateId });
    expect(shifts.length).toBe(1);
    expect(shifts[0].recurrenceId?.toISOString()).toBe("2026-10-07T09:00:00.000Z");
    expect(shifts[0].status).toBe(SHIFT_STATUS.PUBLISHED);
    expect(shifts[0].currentVolunteers).toBe(1);
  });

  it("reuses the same shift when a second volunteer signs up for the same occurrence", async () => {
    const locId = await makeLocation();
    const templateId = await makeTemplate(locId);
    const vol1 = await makeVolunteer("occ1@example.com");
    const vol2 = await makeVolunteer("occ2@example.com");

    const body = { templateId, recurrenceId: "2026-10-07T09:00:00Z", createdBy: "admin" };
    await post("/signups").send({ volunteerId: vol1, ...body });
    await post("/signups").send({ volunteerId: vol2, ...body });

    // Idempotent materialization: one shift, two signups on it.
    const shifts = await ShiftModel.find({ templateId });
    expect(shifts.length).toBe(1);
    expect(shifts[0].currentVolunteers).toBe(2);
  });

  it("does not materialize a shift when the signup is rejected on eligibility", async () => {
    const locId = await makeLocation();
    const templateId = await makeTemplate(locId, { minAge: 21 });
    // Volunteer born 2010 — under 21 at the shift's start.
    const res = await post("/volunteers").send({
      firstName: "Young",
      lastName: "Volunteer",
      address: "123 Test St",
      dateOfBirth: "2010-01-01",
      email: "young@example.com",
      phone: "555-0100",
      emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
      createdBy: "admin",
    });
    const volId = res.body._id;

    const signup = await post("/signups").send({
      volunteerId: volId,
      templateId,
      recurrenceId: "2026-10-07T09:00:00Z",
      createdBy: "admin",
    });
    expect(signup.status).toBe(400);
    // Rejected request must not leave an orphaned occurrence row behind.
    expect(await ShiftModel.countDocuments({ templateId })).toBe(0);
  });

  it("rejects a recurrenceId that is not an occurrence of the series", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const templateId = await makeTemplate(locId);

    const res = await post("/signups").send({
      volunteerId: volId,
      templateId,
      recurrenceId: "2026-10-08T09:00:00Z", // Thursday — not a Mon/Wed slot
      createdBy: "admin",
    });
    expect(res.status).toBe(400);
    expect(await ShiftModel.countDocuments({ templateId })).toBe(0);
  });

  it("rejects providing both shiftId and a recurrence occurrence", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);
    const templateId = await makeTemplate(locId);

    const res = await post("/signups").send({
      volunteerId: volId,
      shiftId,
      templateId,
      recurrenceId: "2026-10-07T09:00:00Z",
      createdBy: "admin",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /volunteers/:id/hours", () => {
  it("computes total hours from completed signups", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const shiftId = await makeShift(locId);

    const signup = await post("/signups").send({ volunteerId: volId, shiftId, createdBy: "admin" });
    await put(`/signups/${signup.body._id}/checkin`);
    await put(`/signups/${signup.body._id}/checkout`);

    const res = await get(`/volunteers/${volId}/hours`);
    expect(res.status).toBe(200);
    expect(res.body.totalHours).toBeGreaterThanOrEqual(0);
  });
});

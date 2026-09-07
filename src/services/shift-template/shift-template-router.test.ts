import { get, post, put, del } from "../../common/testTools";
import { ShiftModel } from "../shift/shift-schemas";

async function makeLocation() {
  const res = await post("/locations").send({ name: "Template Hall", address: "123 Test St", createdBy: "admin" });
  return res.body._id as string;
}

async function makeVolunteer() {
  const res = await post("/volunteers").send({
    firstName: "Test",
    lastName: "Volunteer",
    address: "123 Test St",
    dateOfBirth: "1990-01-01",
    email: "tmpl-vol@example.com",
    phone: "555-0100",
    emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" },
    createdBy: "admin",
  });
  return res.body._id as string;
}

const BASE_TEMPLATE = (locationId: string) => ({
  title: "Weekly Desk",
  locationId,
  startTime: "2026-10-06T09:00:00Z",
  endTime: "2026-10-06T12:00:00Z",
  maxVolunteers: 3,
  recurrenceRule: {
    frequency: "weekly",
    daysOfWeek: [1, 3],
    occurrences: 4,
  },
  createdBy: "admin",
});

const OCT = "?from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z";

describe("POST /shift-templates", () => {
  it("creates a template without eagerly generating shift rows", async () => {
    const locId = await makeLocation();
    const res = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    expect(res.status).toBe(201);

    // Occurrences are virtual now — no Shift rows exist until signup/edit.
    const shifts = await ShiftModel.find({ templateId: res.body._id });
    expect(shifts.length).toBe(0);
  });
});

describe("GET /shift-templates/:id/occurrences", () => {
  // Pins the exact occurrences, not just the count: daysOfWeek [1,3] = Mon/Wed
  // (JS convention, 0=Sun), expanded from a Tue 2026-10-06 start. The first
  // Monday (Oct 5) is before dtStart so it's excluded. Times stay at 09:00Z
  // regardless of the machine timezone.
  it("expands the rule into virtual occurrences at the correct instants", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));

    const res = await get(`/shift-templates/${created.body._id}/occurrences${OCT}`);
    expect(res.status).toBe(200);
    expect(res.body.occurrences.map((o: { startTime: string }) => o.startTime)).toEqual([
      "2026-10-07T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
      "2026-10-14T09:00:00.000Z",
      "2026-10-19T09:00:00.000Z",
    ]);
    // all virtual: no backing row, recurrenceId equals startTime, zero signups
    res.body.occurrences.forEach((o: { concrete: boolean; recurrenceId: string; startTime: string; shiftId?: string; currentVolunteers: number }) => {
      expect(o.concrete).toBe(false);
      expect(o.shiftId).toBeUndefined();
      expect(o.recurrenceId).toBe(o.startTime);
      expect(o.currentVolunteers).toBe(0);
    });
  });

  it("reports minAge on virtual occurrences", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send({ ...BASE_TEMPLATE(locId), minAge: 18 });

    const res = await get(`/shift-templates/${created.body._id}/occurrences${OCT}`);
    expect(res.body.occurrences.length).toBeGreaterThan(0);
    res.body.occurrences.forEach((o: { minAge: number }) => expect(o.minAge).toBe(18));
  });

  it("expands past 100 occurrences when bounded only by endDate", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send({
      ...BASE_TEMPLATE(locId),
      recurrenceRule: {
        frequency: "daily",
        interval: 1,
        endDate: "2027-02-01T00:00:00Z", // ~118 days from the 2026-10-06 start
      },
    });

    const res = await get(
      `/shift-templates/${created.body._id}/occurrences?from=2026-10-01T00:00:00Z&to=2027-03-01T00:00:00Z`
    );
    expect(res.status).toBe(200);
    expect(res.body.occurrences.length).toBeGreaterThan(100);
  });

  it("requires from and to", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const res = await get(`/shift-templates/${created.body._id}/occurrences`);
    expect(res.status).toBe(400);
  });

  it("rejects a range wider than the cap", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const res = await get(
      `/shift-templates/${created.body._id}/occurrences?from=2026-01-01T00:00:00Z&to=2027-12-31T00:00:00Z`
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /shift-templates — validation", () => {
  it("rejects recurrence rule with neither endDate nor occurrences", async () => {
    const locId = await makeLocation();
    const res = await post("/shift-templates").send({
      ...BASE_TEMPLATE(locId),
      recurrenceRule: { frequency: "daily", interval: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown location", async () => {
    const res = await post("/shift-templates").send(
      BASE_TEMPLATE("000000000000000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("rejects endTime before startTime", async () => {
    const locId = await makeLocation();
    const res = await post("/shift-templates").send({
      ...BASE_TEMPLATE(locId),
      startTime: "2026-10-06T12:00:00Z",
      endTime: "2026-10-06T09:00:00Z",
    });
    expect(res.status).toBe(400);
  });
});

async function signUpForOccurrence(templateId: string, recurrenceId: string) {
  const volId = await makeVolunteer();
  return post("/signups").send({ volunteerId: volId, templateId, recurrenceId, createdBy: "admin" });
}

const titlesBySlot = (occurrences: { recurrenceId: string; title: string }[]) =>
  Object.fromEntries(occurrences.map((o) => [o.recurrenceId, o.title]));

describe("PUT /shift-templates/:id — edit the whole series", () => {
  it("propagates a field change to virtual and non-detached materialized occurrences", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    // Materialize Oct 7 via a signup (stays attached: detached = false).
    await signUpForOccurrence(templateId, "2026-10-07T09:00:00Z");

    const res = await put(`/shift-templates/${templateId}`).send({ title: "Reception" });
    expect(res.status).toBe(200);

    // Materialized occurrence updated in place.
    const shift = await ShiftModel.findOne({ templateId });
    expect(shift!.title).toBe("Reception");

    // Virtual occurrences reflect the new default too.
    const occ = await get(`/shift-templates/${templateId}/occurrences${OCT}`);
    occ.body.occurrences.forEach((o: { title: string }) => expect(o.title).toBe("Reception"));
  });

  it("rejects a schedule change once occurrences have materialized (409)", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;
    await signUpForOccurrence(templateId, "2026-10-07T09:00:00Z");

    const res = await put(`/shift-templates/${templateId}`).send({
      recurrenceRule: { frequency: "weekly", daysOfWeek: [2], occurrences: 3 },
    });
    expect(res.status).toBe(409);
  });

  it("allows a schedule change while no occurrences have materialized", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    const res = await put(`/shift-templates/${templateId}`).send({
      recurrenceRule: { frequency: "weekly", daysOfWeek: [5], occurrences: 2 }, // Fridays
    });
    expect(res.status).toBe(200);

    const occ = await get(`/shift-templates/${templateId}/occurrences${OCT}`);
    // Oct 9 and Oct 16 are the first two Fridays on/after the Oct 6 start.
    expect(occ.body.occurrences.map((o: { startTime: string }) => o.startTime)).toEqual([
      "2026-10-09T09:00:00.000Z",
      "2026-10-16T09:00:00.000Z",
    ]);
  });
});

describe("PUT /shift-templates/:id/occurrences — edit a single occurrence", () => {
  it("materializes, detaches, and applies the change to just that occurrence", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    const res = await put(`/shift-templates/${templateId}/occurrences`).send({
      recurrenceId: "2026-10-14T09:00:00Z",
      startTime: "2026-10-14T10:00:00Z",
      endTime: "2026-10-14T13:00:00Z",
    });
    expect(res.status).toBe(200);
    expect(res.body.detached).toBe(true);

    const occ = await get(`/shift-templates/${templateId}/occurrences${OCT}`);
    const oct14 = occ.body.occurrences.find(
      (o: { recurrenceId: string }) => o.recurrenceId === "2026-10-14T09:00:00.000Z"
    );
    expect(oct14.concrete).toBe(true);
    expect(oct14.startTime).toBe("2026-10-14T10:00:00.000Z"); // edited time
    // the other three are still virtual at their original instants
    expect(occ.body.occurrences.filter((o: { concrete: boolean }) => !o.concrete)).toHaveLength(3);
  });

  it("keeps its own edit when the series is later edited as a whole", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    await put(`/shift-templates/${templateId}/occurrences`).send({
      recurrenceId: "2026-10-14T09:00:00Z",
      title: "Special",
    });
    await put(`/shift-templates/${templateId}`).send({ title: "Reception" });

    const occ = await get(`/shift-templates/${templateId}/occurrences${OCT}`);
    const titles = titlesBySlot(occ.body.occurrences);
    expect(titles["2026-10-14T09:00:00.000Z"]).toBe("Special"); // detached, kept
    expect(titles["2026-10-07T09:00:00.000Z"]).toBe("Reception"); // virtual, followed
  });
});

describe("PUT /shift-templates/:id/split — this and following", () => {
  it("splits the series at an occurrence, carrying changes onto the new series", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    const res = await put(`/shift-templates/${templateId}/split`).send({
      splitAt: "2026-10-14T09:00:00Z",
      title: "Evening Desk",
    });
    expect(res.status).toBe(200);
    const newId = res.body.series._id;

    const orig = await get(`/shift-templates/${templateId}/occurrences${OCT}`);
    expect(orig.body.occurrences.map((o: { startTime: string }) => o.startTime)).toEqual([
      "2026-10-07T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
    ]);

    const next = await get(`/shift-templates/${newId}/occurrences${OCT}`);
    expect(next.body.occurrences.map((o: { startTime: string }) => o.startTime)).toEqual([
      "2026-10-14T09:00:00.000Z",
      "2026-10-19T09:00:00.000Z",
    ]);
    next.body.occurrences.forEach((o: { title: string }) => expect(o.title).toBe("Evening Desk"));
  });

  it("re-points a materialized occurrence at/after the split to the new series", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    await signUpForOccurrence(templateId, "2026-10-14T09:00:00Z"); // materialize Oct 14
    const res = await put(`/shift-templates/${templateId}/split`).send({
      splitAt: "2026-10-14T09:00:00Z",
    });
    const newId = res.body.series._id;

    expect(await ShiftModel.countDocuments({ templateId })).toBe(0);
    expect(await ShiftModel.countDocuments({ templateId: newId })).toBe(1);
  });
});

describe("GET /shift-templates", () => {
  it("returns all templates", async () => {
    const locId = await makeLocation();
    await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const res = await get("/shift-templates");
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });
});

describe("GET /shift-templates/:id", () => {
  it("returns a template", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const res = await get(`/shift-templates/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Weekly Desk");
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/shift-templates/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /shift-templates/:id", () => {
  it("deletes a template with no materialized shifts", async () => {
    const locId = await makeLocation();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const res = await del(`/shift-templates/${created.body._id}`);
    expect(res.status).toBe(204);
    expect((await get(`/shift-templates/${created.body._id}`)).status).toBe(404);
  });

  it("nullifies templateId on materialized shifts instead of deleting them", async () => {
    const locId = await makeLocation();
    const volId = await makeVolunteer();
    const created = await post("/shift-templates").send(BASE_TEMPLATE(locId));
    const templateId = created.body._id;

    // Sign up for one occurrence to materialize a concrete shift row.
    const signup = await post("/signups").send({
      volunteerId: volId,
      templateId,
      recurrenceId: "2026-10-07T09:00:00Z",
      createdBy: "admin",
    });
    expect(signup.status).toBe(201);

    const materialized = await ShiftModel.find({ templateId });
    expect(materialized.length).toBe(1);
    const shiftId = materialized[0]._id;

    const res = await del(`/shift-templates/${templateId}`);
    expect(res.status).toBe(204);

    // Shift survives (a volunteer signed up), just detached from the template.
    const shift = await ShiftModel.findById(shiftId);
    expect(shift).not.toBeNull();
    expect(shift!.templateId).toBeUndefined();
  });
});

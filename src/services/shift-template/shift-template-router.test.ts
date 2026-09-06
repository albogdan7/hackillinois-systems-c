import { get, post, del } from "../../common/testTools";
import { ShiftModel } from "../shift/shift-schemas";
import { SHIFT_STATUS } from "../shift/shift-schemas";

async function makeLocation() {
  const res = await post("/locations").send({ name: "Template Hall" });
  return res.body._id as string;
}

async function makeShift(locationId: string) {
  const res = await post("/shifts").send({
    title: "Weekly Desk",
    locationId,
    startTime: "2026-10-06T09:00:00Z",
    endTime: "2026-10-06T12:00:00Z",
    maxVolunteers: 3,
    status: SHIFT_STATUS.PUBLISHED,
    createdBy: "admin",
  });
  return res.body._id as string;
}

const BASE_TEMPLATE = (shiftId: string) => ({
  shiftId,
  recurrenceRule: {
    frequency: "weekly",
    daysOfWeek: [1, 3],
    occurrences: 4,
  },
  createdBy: "admin",
});

describe("POST /shift-templates", () => {
  it("creates a template and generates shifts", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    const res = await post("/shift-templates").send(BASE_TEMPLATE(shiftId));
    expect(res.status).toBe(201);

    const shifts = await ShiftModel.find({ templateId: res.body._id });
    expect(shifts.length).toBe(4);
  });

  it("rejects recurrence rule with neither endDate nor occurrences", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    const res = await post("/shift-templates").send({
      ...BASE_TEMPLATE(shiftId),
      recurrenceRule: { frequency: "daily", interval: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown shift", async () => {
    const res = await post("/shift-templates").send(
      BASE_TEMPLATE("000000000000000000000000")
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /shift-templates", () => {
  it("returns all templates", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    await post("/shift-templates").send(BASE_TEMPLATE(shiftId));
    const res = await get("/shift-templates");
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });
});

describe("GET /shift-templates/:id", () => {
  it("returns a template", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    const created = await post("/shift-templates").send(BASE_TEMPLATE(shiftId));
    const res = await get(`/shift-templates/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.shiftId).toBe(shiftId);
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/shift-templates/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /shift-templates/:id", () => {
  it("deletes template and nullifies templateId on shifts", async () => {
    const locId = await makeLocation();
    const shiftId = await makeShift(locId);
    const created = await post("/shift-templates").send(BASE_TEMPLATE(shiftId));
    const templateId = created.body._id;

    const shiftsBefore = await ShiftModel.find({ templateId });
    expect(shiftsBefore.length).toBeGreaterThan(0);

    const res = await del(`/shift-templates/${templateId}`);
    expect(res.status).toBe(204);

    const shiftsAfter = await ShiftModel.find({ templateId });
    expect(shiftsAfter.length).toBe(0);

    const orphaned = await ShiftModel.find({ _id: { $in: shiftsBefore.map((s) => s._id) } });
    orphaned.forEach((s) => expect(s.templateId).toBeUndefined());
  });
});

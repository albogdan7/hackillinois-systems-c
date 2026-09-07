import mongoose from "mongoose";
import { expandSeries } from "./shift-template-lib";
import { IShiftTemplate } from "./shift-template-schemas";
import { IShift } from "../shift/shift-schemas";

// Pure unit tests for expandSeries — no database, no HTTP. Occurrences are
// computed from the rule and overlaid with any concrete override shifts.

type SeriesDoc = IShiftTemplate & { _id: mongoose.Types.ObjectId };
type ShiftDoc = IShift & { _id: mongoose.Types.ObjectId };

const locationId = new mongoose.Types.ObjectId();

function makeSeries(overrides: Partial<SeriesDoc> = {}): SeriesDoc {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: "Weekly Desk",
    locationId,
    startTime: new Date("2026-10-06T09:00:00Z"), // Tuesday
    endTime: new Date("2026-10-06T12:00:00Z"),
    recurrenceRule: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3], occurrences: 4 },
    createdBy: "admin",
    ...overrides,
  } as SeriesDoc;
}

const RANGE = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T23:59:59Z") };

describe("expandSeries", () => {
  it("produces virtual occurrences at the correct instants when there are no overrides", () => {
    const occ = expandSeries(makeSeries(), RANGE, []);

    expect(occ.map((o) => o.recurrenceId.toISOString())).toEqual([
      "2026-10-07T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
      "2026-10-14T09:00:00.000Z",
      "2026-10-19T09:00:00.000Z",
    ]);
    // all virtual: no _id, default values, zero signups, 3h duration
    occ.forEach((o) => {
      expect(o.concrete).toBe(false);
      expect(o.shiftId).toBeUndefined();
      expect(o.currentVolunteers).toBe(0);
      expect(o.title).toBe("Weekly Desk");
      expect(o.endTime.getTime() - o.startTime.getTime()).toBe(3 * 60 * 60 * 1000);
    });
  });

  it("overlays a concrete override on the matching slot, leaving the rest virtual", () => {
    const override = {
      _id: new mongoose.Types.ObjectId(),
      title: "Weekly Desk (moved)",
      locationId,
      recurrenceId: new Date("2026-10-14T09:00:00Z"), // original slot
      startTime: new Date("2026-10-14T10:00:00Z"), // individually edited to 10:00
      endTime: new Date("2026-10-14T13:00:00Z"),
      currentVolunteers: 2,
      status: "published",
      detached: true,
      createdBy: "admin",
    } as ShiftDoc;

    const occ = expandSeries(makeSeries(), RANGE, [override]);

    const oct14 = occ.find((o) => o.recurrenceId.toISOString() === "2026-10-14T09:00:00.000Z")!;
    expect(oct14.concrete).toBe(true);
    expect(oct14.shiftId).toBe(override._id.toString());
    expect(oct14.startTime.toISOString()).toBe("2026-10-14T10:00:00.000Z"); // edited time wins
    expect(oct14.status).toBe("published");
    expect(oct14.currentVolunteers).toBe(2);

    // the other three remain virtual
    expect(occ.filter((o) => !o.concrete)).toHaveLength(3);
  });

  it("only returns occurrences within the requested range", () => {
    const occ = expandSeries(makeSeries(), {
      from: new Date("2026-10-13T00:00:00Z"),
      to: new Date("2026-10-15T00:00:00Z"),
    }, []);

    expect(occ.map((o) => o.recurrenceId.toISOString())).toEqual(["2026-10-14T09:00:00.000Z"]);
  });
});

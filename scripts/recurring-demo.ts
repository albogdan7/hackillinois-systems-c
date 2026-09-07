/**
 * End-to-end walkthrough of the recurring-shifts model against the real app,
 * using an in-memory MongoDB (no external database needed).
 *
 *   npx ts-node scripts/recurring-demo.ts
 *
 * It traces: create series -> view virtual occurrences -> sign up (materialize)
 * -> edit one occurrence (detach) -> edit the whole series -> split.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import supertest from "supertest";
import { app } from "../src/app";

const api = supertest(app);
const line = (s: string) => console.log(`\n\x1b[36m# ${s}\x1b[0m`);
// Compact view of an occurrences response: slot -> {concrete, title, time}
const show = (occs: any[]) =>
  occs.map((o) => ({
    slot: o.recurrenceId.slice(0, 16),
    concrete: o.concrete,
    signups: o.currentVolunteers,
    title: o.title,
    startsAt: o.startTime.slice(11, 16),
  }));

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const OCT = "?from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z";

  line("1. Create a location and a WEEKLY Mon/Wed series (4 occurrences, 9-12)");
  const loc = await api.post("/locations").send({ name: "Front Desk", capacity: 5, address: "1 Main", createdBy: "admin" });
  const tmpl = await api.post("/shift-templates").send({
    title: "Front Desk",
    locationId: loc.body._id,
    startTime: "2026-10-06T09:00:00Z", // Tuesday
    endTime: "2026-10-06T12:00:00Z",
    maxVolunteers: 3,
    recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3], occurrences: 4 },
    createdBy: "admin",
  });
  const seriesId = tmpl.body._id;
  const shiftRows1 = await mongoose.connection.collection("shifts").countDocuments();
  console.log(`created series ${seriesId} — Shift rows in DB: ${shiftRows1}  <-- zero, occurrences are virtual`);

  line("2. GET occurrences — expanded from the rule on read, all virtual");
  const occ1 = await api.get(`/shift-templates/${seriesId}/occurrences${OCT}`);
  console.table(show(occ1.body.occurrences));

  line("3. A volunteer signs up for the Oct 7 occurrence -> it materializes");
  const vol = await api.post("/volunteers").send({
    firstName: "Ada", lastName: "L", address: "1 Main", dateOfBirth: "1990-01-01",
    email: "ada@example.com", phone: "555-0100",
    emergencyContact: { name: "EC", phone: "555-0199", relationship: "parent" }, createdBy: "admin",
  });
  const signup = await api.post("/signups").send({
    volunteerId: vol.body._id, templateId: seriesId, recurrenceId: "2026-10-07T09:00:00Z", createdBy: "admin",
  });
  const shiftRows2 = await mongoose.connection.collection("shifts").countDocuments();
  console.log(`signup status: ${signup.body.status} — Shift rows in DB now: ${shiftRows2}  <-- exactly one, the touched slot`);
  const occ2 = await api.get(`/shift-templates/${seriesId}/occurrences${OCT}`);
  console.table(show(occ2.body.occurrences));

  line("4. Edit ONE occurrence (Oct 14 -> starts 10:00) — materializes + detaches it");
  await api.put(`/shift-templates/${seriesId}/occurrences`).send({
    recurrenceId: "2026-10-14T09:00:00Z", startTime: "2026-10-14T10:00:00Z", endTime: "2026-10-14T13:00:00Z",
  });
  const occ3 = await api.get(`/shift-templates/${seriesId}/occurrences${OCT}`);
  console.table(show(occ3.body.occurrences));

  line("5. Edit the WHOLE series (rename to 'Reception') — virtual + attached update, detached kept");
  await api.put(`/shift-templates/${seriesId}`).send({ title: "Reception" });
  const occ4 = await api.get(`/shift-templates/${seriesId}/occurrences${OCT}`);
  console.table(show(occ4.body.occurrences));
  console.log("note: Oct 14 keeps its own start (10:00) AND — being detached — is the one that could keep its own title; the rest followed the rename.");

  line("6. Split at Oct 14 ('this and following') into a new series titled 'Evening'");
  const split = await api.put(`/shift-templates/${seriesId}/split`).send({ splitAt: "2026-10-14T09:00:00Z", title: "Evening" });
  const newId = split.body.series._id;
  console.log("ORIGINAL series now:");
  console.table(show((await api.get(`/shift-templates/${seriesId}/occurrences${OCT}`)).body.occurrences));
  console.log(`NEW series ${newId} now:`);
  console.table(show((await api.get(`/shift-templates/${newId}/occurrences${OCT}`)).body.occurrences));

  await mongoose.disconnect();
  await mongod.stop();
  console.log("\n\x1b[32mdone.\x1b[0m");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

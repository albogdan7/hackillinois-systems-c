import { get, post, put, del } from "../../common/testTools";

const BASE_VOLUNTEER = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  createdBy: "admin",
};

describe("GET /volunteers", () => {
  it("returns empty array initially", async () => {
    const res = await get("/volunteers");
    expect(res.status).toBe(200);
    expect(res.body.volunteers).toEqual([]);
  });
});

describe("POST /volunteers", () => {
  it("creates a volunteer", async () => {
    const res = await post("/volunteers").send(BASE_VOLUNTEER);
    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe("Jane");
    expect(res.body.email).toBe("jane@example.com");
  });

  it("creates a volunteer with all fields", async () => {
    const res = await post("/volunteers").send({
      ...BASE_VOLUNTEER,
      phone: "555-1234",
      skills: ["first-aid", "driving"],
      emergencyContact: { name: "John Doe", phone: "555-5678", relationship: "spouse" },
    });
    expect(res.status).toBe(201);
    expect(res.body.skills).toEqual(["first-aid", "driving"]);
    expect(res.body.emergencyContact.name).toBe("John Doe");
  });

  it("rejects missing required fields", async () => {
    const res = await post("/volunteers").send({ firstName: "Jane" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email", async () => {
    const res = await post("/volunteers").send({ ...BASE_VOLUNTEER, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate email", async () => {
    await post("/volunteers").send(BASE_VOLUNTEER);
    const res = await post("/volunteers").send({ ...BASE_VOLUNTEER, firstName: "Janet" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EmailConflict");
  });

  it("rejects invalid skill", async () => {
    const res = await post("/volunteers").send({ ...BASE_VOLUNTEER, skills: ["flying"] });
    expect(res.status).toBe(400);
  });
});

describe("GET /volunteers/:id", () => {
  it("returns a volunteer by id", async () => {
    const created = await post("/volunteers").send(BASE_VOLUNTEER);
    const res = await get(`/volunteers/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.lastName).toBe("Doe");
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/volunteers/000000000000000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VolunteerNotFound");
  });
});

describe("PUT /volunteers/:id", () => {
  it("updates a volunteer", async () => {
    const created = await post("/volunteers").send(BASE_VOLUNTEER);
    const res = await put(`/volunteers/${created.body._id}`).send({ phone: "555-9999" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("555-9999");
  });

  it("rejects email conflict", async () => {
    await post("/volunteers").send({ ...BASE_VOLUNTEER, email: "other@example.com" });
    const v2 = await post("/volunteers").send({ ...BASE_VOLUNTEER, email: "jane2@example.com" });
    const res = await put(`/volunteers/${v2.body._id}`).send({ email: "other@example.com" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /volunteers/:id", () => {
  it("deletes a volunteer", async () => {
    const created = await post("/volunteers").send(BASE_VOLUNTEER);
    const res = await del(`/volunteers/${created.body._id}`);
    expect(res.status).toBe(204);
    const check = await get(`/volunteers/${created.body._id}`);
    expect(check.status).toBe(404);
  });
});

describe("GET /volunteers/leaderboard", () => {
  it("returns empty leaderboard when no completed signups", async () => {
    const res = await get("/volunteers/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([]);
  });

  it("ranks volunteers by total hours descending", async () => {
    const loc = await post("/locations").send({ name: "LB Hall", capacity: 10, address: "123 Test St", createdBy: "admin" });
    const shift1 = await post("/shifts").send({
      title: "Morning",
      locationId: loc.body._id,
      startTime: "2024-01-01T09:00:00Z",
      endTime: "2024-01-01T12:00:00Z",
      maxVolunteers: 5,
      status: "published",
      createdBy: "admin",
    });
    const shift2 = await post("/shifts").send({
      title: "Afternoon",
      locationId: loc.body._id,
      startTime: "2024-01-01T13:00:00Z",
      endTime: "2024-01-01T17:00:00Z",
      maxVolunteers: 5,
      status: "published",
      createdBy: "admin",
    });

    const vol1 = await post("/volunteers").send({
      firstName: "Alice",
      lastName: "A",
      email: "alice.lb@example.com",
      createdBy: "admin",
    });
    const vol2 = await post("/volunteers").send({
      firstName: "Bob",
      lastName: "B",
      email: "bob.lb@example.com",
      createdBy: "admin",
    });

    // vol1 signs up for both shifts and completes them (3h + 4h = 7h)
    const s1 = await post("/signups").send({
      volunteerId: vol1.body._id,
      shiftId: shift1.body._id,
      createdBy: "admin",
    });
    await put(`/signups/${s1.body._id}/checkin`);
    await put(`/signups/${s1.body._id}/checkout`);

    const s2 = await post("/signups").send({
      volunteerId: vol1.body._id,
      shiftId: shift2.body._id,
      createdBy: "admin",
    });
    await put(`/signups/${s2.body._id}/checkin`);
    await put(`/signups/${s2.body._id}/checkout`);

    // vol2 completes only the morning shift (3h)
    const s3 = await post("/signups").send({
      volunteerId: vol2.body._id,
      shiftId: shift1.body._id,
      createdBy: "admin",
    });
    await put(`/signups/${s3.body._id}/checkin`);
    await put(`/signups/${s3.body._id}/checkout`);

    const res = await get("/volunteers/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toHaveLength(2);
    expect(res.body.leaderboard[0].email).toBe("alice.lb@example.com");
    expect(res.body.leaderboard[0].shiftsCompleted).toBe(2);
    expect(res.body.leaderboard[1].email).toBe("bob.lb@example.com");
  });

  it("respects the limit query param", async () => {
    // Create 3 volunteers with completed signups
    const loc = await post("/locations").send({ name: "Limit Hall", capacity: 10, address: "123 Test St", createdBy: "admin" });
    const shift = await post("/shifts").send({
      title: "Limit Shift",
      locationId: loc.body._id,
      startTime: "2024-02-01T09:00:00Z",
      endTime: "2024-02-01T12:00:00Z",
      maxVolunteers: 10,
      status: "published",
      createdBy: "admin",
    });

    for (let i = 0; i < 3; i++) {
      const vol = await post("/volunteers").send({
        firstName: `Vol${i}`,
        lastName: "L",
        email: `vol${i}.limit@example.com`,
        createdBy: "admin",
      });
      const signup = await post("/signups").send({
        volunteerId: vol.body._id,
        shiftId: shift.body._id,
        createdBy: "admin",
      });
      await put(`/signups/${signup.body._id}/checkin`);
      await put(`/signups/${signup.body._id}/checkout`);
    }

    const res = await get("/volunteers/leaderboard?limit=2");
    expect(res.body.leaderboard).toHaveLength(2);
  });
});

import { get, post, put, del } from "../../common/testTools";

const BASE_VOLUNTEER = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
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

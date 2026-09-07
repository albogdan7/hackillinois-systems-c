import { get, post, put, del } from "../../common/testTools";

const BASE_HOST = {
  companyName: "Helping Hands Inc",
  description: "Community volunteering nonprofit",
  contact: { name: "Pat Organizer", email: "pat@helpinghands.org", phone: "555-0100" },
  createdBy: "admin",
};

describe("GET /hosts", () => {
  it("returns empty array when no hosts exist", async () => {
    const res = await get("/hosts");
    expect(res.status).toBe(200);
    expect(res.body.hosts).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it("returns all hosts with pagination metadata", async () => {
    await post("/hosts").send(BASE_HOST);
    await post("/hosts").send({ ...BASE_HOST, companyName: "Second Org" });
    const res = await get("/hosts");
    expect(res.status).toBe(200);
    expect(res.body.hosts).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it("paginates results", async () => {
    await post("/hosts").send({ ...BASE_HOST, companyName: "Org A" });
    await post("/hosts").send({ ...BASE_HOST, companyName: "Org B" });
    await post("/hosts").send({ ...BASE_HOST, companyName: "Org C" });

    const page1 = await get("/hosts?page=1&limit=2");
    expect(page1.body.hosts).toHaveLength(2);
    expect(page1.body.pagination.hasNext).toBe(true);

    const page2 = await get("/hosts?page=2&limit=2");
    expect(page2.body.hosts).toHaveLength(1);
    expect(page2.body.pagination.hasPrev).toBe(true);
  });
});

describe("POST /hosts", () => {
  it("creates a host with a contact person", async () => {
    const res = await post("/hosts").send(BASE_HOST);
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("Helping Hands Inc");
    expect(res.body.contact.name).toBe("Pat Organizer");
    expect(res.body.contact.email).toBe("pat@helpinghands.org");
  });

  it("rejects missing companyName", async () => {
    const { companyName: _omit, ...noName } = BASE_HOST;
    const res = await post("/hosts").send(noName);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("rejects missing contact", async () => {
    const { contact: _omit, ...noContact } = BASE_HOST;
    const res = await post("/hosts").send(noContact);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid contact email", async () => {
    const res = await post("/hosts").send({
      ...BASE_HOST,
      contact: { name: "Pat", email: "not-an-email" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing createdBy", async () => {
    const { createdBy: _omit, ...noCreator } = BASE_HOST;
    const res = await post("/hosts").send(noCreator);
    expect(res.status).toBe(400);
  });

  it("rejects duplicate companyName", async () => {
    await post("/hosts").send(BASE_HOST);
    const res = await post("/hosts").send(BASE_HOST);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("HostNameConflict");
  });
});

describe("GET /hosts/:id", () => {
  it("returns a host by id", async () => {
    const created = await post("/hosts").send(BASE_HOST);
    const res = await get(`/hosts/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Helping Hands Inc");
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/hosts/000000000000000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("HostNotFound");
  });
});

describe("PUT /hosts/:id", () => {
  it("updates a host", async () => {
    const created = await post("/hosts").send(BASE_HOST);
    const res = await put(`/hosts/${created.body._id}`).send({
      companyName: "Renamed Org",
      contact: { name: "New Contact", email: "new@org.com" },
      updatedBy: "admin",
    });
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Renamed Org");
    expect(res.body.contact.name).toBe("New Contact");
  });

  it("returns 404 for unknown id", async () => {
    const res = await put("/hosts/000000000000000000000000").send({ companyName: "X", updatedBy: "admin" });
    expect(res.status).toBe(404);
  });

  it("rejects name conflict with another host", async () => {
    await post("/hosts").send({ ...BASE_HOST, companyName: "Org A" });
    const b = await post("/hosts").send({ ...BASE_HOST, companyName: "Org B" });
    const res = await put(`/hosts/${b.body._id}`).send({ companyName: "Org A", updatedBy: "admin" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /hosts/:id", () => {
  it("deletes a host", async () => {
    const created = await post("/hosts").send(BASE_HOST);
    const res = await del(`/hosts/${created.body._id}`);
    expect(res.status).toBe(204);
    const check = await get(`/hosts/${created.body._id}`);
    expect(check.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const res = await del("/hosts/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

describe("GET /hosts/:id/events", () => {
  it("lists only the events belonging to the host", async () => {
    const hostA = await post("/hosts").send({ ...BASE_HOST, companyName: "Host A" });
    const hostB = await post("/hosts").send({ ...BASE_HOST, companyName: "Host B" });

    await post("/events").send({
      name: "A Event",
      hostId: hostA.body._id,
      startDate: "2026-10-01T00:00:00Z",
      endDate: "2026-10-31T23:59:59Z",
      createdBy: "admin",
    });
    await post("/events").send({
      name: "B Event",
      hostId: hostB.body._id,
      startDate: "2026-10-01T00:00:00Z",
      endDate: "2026-10-31T23:59:59Z",
      createdBy: "admin",
    });

    const res = await get(`/hosts/${hostA.body._id}/events`);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].name).toBe("A Event");
    expect(res.body.pagination).toBeDefined();
  });

  it("returns 404 for unknown host", async () => {
    const res = await get("/hosts/000000000000000000000000/events");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("HostNotFound");
  });
});

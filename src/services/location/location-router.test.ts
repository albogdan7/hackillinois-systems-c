import { get, post, put, del } from "../../common/testTools";

describe("GET /locations", () => {
  it("returns empty array when no locations exist", async () => {
    const res = await get("/locations");
    expect(res.status).toBe(200);
    expect(res.body.locations).toEqual([]);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(0);
  });

  it("returns all locations with pagination metadata", async () => {
    await post("/locations").send({ name: "Main Hall" });
    await post("/locations").send({ name: "Room 101" });
    const res = await get("/locations");
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.totalPages).toBe(1);
  });

  it("paginates results", async () => {
    await post("/locations").send({ name: "Room A" });
    await post("/locations").send({ name: "Room B" });
    await post("/locations").send({ name: "Room C" });

    const page1 = await get("/locations?page=1&limit=2");
    expect(page1.body.locations).toHaveLength(2);
    expect(page1.body.pagination.hasNext).toBe(true);
    expect(page1.body.pagination.hasPrev).toBe(false);
    expect(page1.body.pagination.totalPages).toBe(2);

    const page2 = await get("/locations?page=2&limit=2");
    expect(page2.body.locations).toHaveLength(1);
    expect(page2.body.pagination.hasNext).toBe(false);
    expect(page2.body.pagination.hasPrev).toBe(true);
  });
});

describe("POST /locations", () => {
  it("creates a location", async () => {
    const res = await post("/locations").send({
      name: "Main Hall",
      description: "Primary event space",
      building: "Engineering Hall",
      capacity: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Main Hall");
    expect(res.body.capacity).toBe(200);
  });

  it("creates a location without optional fields", async () => {
    const res = await post("/locations").send({ name: "Outdoor Stage" });
    expect(res.status).toBe(201);
    expect(res.body.building).toBeUndefined();
    expect(res.body.capacity).toBeUndefined();
  });

  it("rejects missing name", async () => {
    const res = await post("/locations").send({ capacity: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("rejects duplicate name", async () => {
    await post("/locations").send({ name: "Main Hall" });
    const res = await post("/locations").send({ name: "Main Hall" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LocationNameConflict");
  });

  it("rejects capacity less than 1", async () => {
    const res = await post("/locations").send({ name: "Lab", capacity: 0 });
    expect(res.status).toBe(400);
  });
});

describe("GET /locations/:id", () => {
  it("returns a location by id", async () => {
    const created = await post("/locations").send({ name: "Library" });
    const res = await get(`/locations/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Library");
  });

  it("returns 404 for unknown id", async () => {
    const res = await get("/locations/000000000000000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("LocationNotFound");
  });
});

describe("PUT /locations/:id", () => {
  it("updates a location", async () => {
    const created = await post("/locations").send({ name: "Old Name" });
    const res = await put(`/locations/${created.body._id}`).send({
      name: "New Name",
      capacity: 50,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    expect(res.body.capacity).toBe(50);
  });

  it("returns 404 for unknown id", async () => {
    const res = await put("/locations/000000000000000000000000").send({
      name: "X",
    });
    expect(res.status).toBe(404);
  });

  it("rejects name conflict with another location", async () => {
    await post("/locations").send({ name: "Room A" });
    const b = await post("/locations").send({ name: "Room B" });
    const res = await put(`/locations/${b.body._id}`).send({ name: "Room A" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /locations/:id", () => {
  it("deletes a location", async () => {
    const created = await post("/locations").send({ name: "Temp Room" });
    const res = await del(`/locations/${created.body._id}`);
    expect(res.status).toBe(204);
    const check = await get(`/locations/${created.body._id}`);
    expect(check.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const res = await del("/locations/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});

import mongoose from "mongoose";

// Connect to the shared in-memory server started in globalSetup. Each suite uses
// its own database so suites can't see each other's data even if run in parallel.
beforeAll(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set — is globalSetup configured?");
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await mongoose.connect(uri, { dbName: `test-${unique}` });

  // Build every model's indexes up front. Otherwise Mongoose builds them in the
  // background on this fresh database while the first tests are already issuing
  // queries, and that race occasionally stalls or fails an early operation.
  // Model.init() resolves once a model's indexes are built.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});

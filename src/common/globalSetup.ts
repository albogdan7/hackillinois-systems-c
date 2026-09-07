import { MongoMemoryServer } from "mongodb-memory-server";

// Start ONE in-memory MongoDB for the whole test run. Previously each test file
// started and stopped its own server, so eight back-to-back cold starts under
// --runInBand occasionally timed out. A single shared server removes that churn;
// each suite connects to it (see testSetup.ts) and uses its own database.
export default async function globalSetup() {
  const instance = await MongoMemoryServer.create();
  (globalThis as unknown as { __MONGOINSTANCE?: MongoMemoryServer }).__MONGOINSTANCE = instance;
  process.env.MONGO_URI = instance.getUri();
}

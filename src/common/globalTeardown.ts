import { MongoMemoryServer } from "mongodb-memory-server";

export default async function globalTeardown() {
  const instance = (globalThis as unknown as { __MONGOINSTANCE?: MongoMemoryServer })
    .__MONGOINSTANCE;
  if (instance) await instance.stop();
}

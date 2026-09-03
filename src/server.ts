import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { connectDB } from "./common/db";

const PORT = process.env.PORT ?? 3000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/volunteer";

async function start() {
  await connectDB(MONGO_URI);
  app.listen(PORT, () => {
    process.stdout.write(`Server running on port ${PORT}\n`);
  });
}

start().catch(console.error);

import express from "express";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./common/errors";
import { generateOpenAPIDocument } from "./common/openapi";
import locationRouter from "./services/location/location-router";
import hostRouter from "./services/host/host-router";
import eventRouter from "./services/event/event-router";
import volunteerRouter from "./services/volunteer/volunteer-router";
import shiftRouter from "./services/shift/shift-router";
import shiftTemplateRouter from "./services/shift-template/shift-template-router";
import signupRouter from "./services/signup/signup-router";

export const app = express();

// Use the simple query parser (not qs) so nested/bracket query params like
// ?status[$ne]=x arrive as plain strings, not objects — preventing NoSQL
// operator injection where list filters flow into Mongoose queries.
app.set("query parser", "simple");

app.use(express.json());

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

const openAPIDocument = generateOpenAPIDocument();

app.get("/", (_req, res) => {
  res.json({ name: "Volunteer Shift Signup API", version: "1.0.0", docs: "/docs" });
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openAPIDocument));
app.get("/docs.json", (_req, res) => res.json(openAPIDocument));

app.use("/locations", locationRouter);
app.use("/hosts", hostRouter);
app.use("/events", eventRouter);
app.use("/volunteers", volunteerRouter);
app.use("/shifts", shiftRouter);
app.use("/shift-templates", shiftTemplateRouter);
app.use("/signups", signupRouter);

app.use(errorHandler);

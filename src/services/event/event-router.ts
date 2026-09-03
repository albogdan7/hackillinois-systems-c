import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateEventSchema, UpdateEventSchema } from "./event-schemas";
import * as lib from "./event-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query as { status?: string };
    const pagination = PaginationSchema.parse(req.query);
    const { data: events, pagination: meta } = await lib.getAllEvents(pagination, status);
    res.json({ events, pagination: meta });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const event = await lib.getEventById(req.params.id);
    res.json(event);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateEventSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const event = await lib.createEvent(result.data);
    res.status(201).json(event);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateEventSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const event = await lib.updateEvent(req.params.id, result.data);
    res.json(event);
  })
);

router.put(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const event = await lib.cancelEvent(req.params.id);
    res.json(event);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteEvent(req.params.id);
    res.status(204).send();
  })
);

export default router;

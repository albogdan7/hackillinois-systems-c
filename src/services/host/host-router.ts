import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateHostSchema, UpdateHostSchema } from "./host-schemas";
import * as lib from "./host-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = PaginationSchema.parse(req.query);
    const { data: hosts, pagination: meta } = await lib.getAllHosts(pagination);
    res.json({ hosts, pagination: meta });
  })
);

router.get(
  "/:id/events",
  asyncHandler(async (req, res) => {
    const pagination = PaginationSchema.parse(req.query);
    const { data: events, pagination: meta } = await lib.getHostEvents(req.params.id, pagination);
    res.json({ events, pagination: meta });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const host = await lib.getHostById(req.params.id);
    res.json(host);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateHostSchema.safeParse(req.body);
    if (!result.success) {
      throw new APIError(400, "BadRequest", result.error.message);
    }
    const host = await lib.createHost(result.data);
    res.status(201).json(host);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateHostSchema.safeParse(req.body);
    if (!result.success) {
      throw new APIError(400, "BadRequest", result.error.message);
    }
    const host = await lib.updateHost(req.params.id, result.data);
    res.json(host);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteHost(req.params.id);
    res.status(204).send();
  })
);

export default router;

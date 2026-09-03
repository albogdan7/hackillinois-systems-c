import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateLocationSchema, UpdateLocationSchema } from "./location-schemas";
import * as lib from "./location-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = PaginationSchema.parse(req.query);
    const { data: locations, pagination: meta } = await lib.getAllLocations(pagination);
    res.json({ locations, pagination: meta });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const location = await lib.getLocationById(req.params.id);
    res.json(location);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateLocationSchema.safeParse(req.body);
    if (!result.success) {
      throw new APIError(400, "BadRequest", result.error.message);
    }
    const location = await lib.createLocation(result.data);
    res.status(201).json(location);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateLocationSchema.safeParse(req.body);
    if (!result.success) {
      throw new APIError(400, "BadRequest", result.error.message);
    }
    const location = await lib.updateLocation(req.params.id, result.data);
    res.json(location);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteLocation(req.params.id);
    res.status(204).send();
  })
);

export default router;

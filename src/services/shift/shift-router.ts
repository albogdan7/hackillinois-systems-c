import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { CreateShiftSchema, UpdateShiftSchema } from "./shift-schemas";
import * as lib from "./shift-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, eventId, locationId, from, to } = req.query as Record<string, string>;
    const shifts = await lib.getAllShifts({ status, eventId, locationId, from, to });
    res.json({ shifts });
  })
);

router.get(
  "/:id/signups",
  asyncHandler(async (req, res) => {
    const signups = await lib.getShiftSignups(req.params.id);
    res.json({ signups });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const shift = await lib.getShiftWithCounts(req.params.id);
    res.json(shift);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateShiftSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const shift = await lib.createShift(result.data);
    res.status(201).json(shift);
  })
);

router.put(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const shift = await lib.cancelShift(req.params.id);
    res.json(shift);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateShiftSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const shift = await lib.updateShift(req.params.id, result.data);
    res.json(shift);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteShift(req.params.id);
    res.status(204).send();
  })
);

export default router;

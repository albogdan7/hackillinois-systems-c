import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateShiftSchema, UpdateShiftSchema, CancelShiftSchema } from "./shift-schemas";
import * as lib from "./shift-lib";
import { getShiftsCalendar } from "../shift-template/shift-template-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, eventId, locationId, skill, from, to } = req.query as Record<string, string>;
    const pagination = PaginationSchema.parse(req.query);
    const { data: shifts, pagination: meta } = await lib.getAllShifts(
      { status, eventId, locationId, skill, from, to },
      pagination
    );
    res.json({ shifts, pagination: meta });
  })
);

// Whole-schedule calendar over [from, to]: standalone shifts + every series'
// occurrences (virtual + materialized). Registered before "/:id" so the literal
// "calendar" segment isn't matched as an id.
router.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string>;
    if (!from || !to) {
      throw new APIError(400, "BadRequest", "from and to query params are required");
    }
    const occurrences = await getShiftsCalendar(new Date(from), new Date(to));
    res.json({ occurrences });
  })
);

router.get(
  "/:id/signups",
  asyncHandler(async (req, res) => {
    const pagination = PaginationSchema.parse(req.query);
    const { data: signups, pagination: meta } = await lib.getShiftSignups(
      req.params.id,
      pagination
    );
    res.json({ signups, pagination: meta });
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
    const result = CancelShiftSchema.safeParse(req.body ?? {});
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const shift = await lib.cancelShift(
      req.params.id,
      result.data.cancellationReason,
      result.data.cancelledBy
    );
    res.json(shift);
  })
);

router.put(
  "/:id/mark-noshows",
  asyncHandler(async (req, res) => {
    const result = await lib.markNoShows(req.params.id);
    res.json(result);
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

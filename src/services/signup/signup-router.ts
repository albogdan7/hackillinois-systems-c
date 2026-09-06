import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateSignupSchema, CancelSignupSchema, UpdateSignupStatusSchema } from "./signup-schemas";
import * as lib from "./signup-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { volunteerId, shiftId, status } = req.query as Record<string, string>;
    const pagination = PaginationSchema.parse(req.query);
    const { data: signups, pagination: meta } = await lib.getAllSignups(
      { volunteerId, shiftId, status },
      pagination
    );
    res.json({ signups, pagination: meta });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const signup = await lib.getSignupById(req.params.id);
    res.json(signup);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateSignupSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const signup = await lib.createSignup(result.data);
    res.status(201).json(signup);
  })
);

router.put(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const result = CancelSignupSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const signup = await lib.cancelSignup(req.params.id, result.data.cancellationReason, result.data.cancelledBy);
    res.json(signup);
  })
);

router.put(
  "/:id/checkin",
  asyncHandler(async (req, res) => {
    const signup = await lib.checkIn(req.params.id);
    res.json(signup);
  })
);

router.put(
  "/:id/checkout",
  asyncHandler(async (req, res) => {
    const signup = await lib.checkOut(req.params.id);
    res.json(signup);
  })
);

router.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const result = UpdateSignupStatusSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const signup = await lib.updateSignupStatus(req.params.id, result.data.status);
    res.json(signup);
  })
);

export default router;

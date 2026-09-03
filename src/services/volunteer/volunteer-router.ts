import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { CreateVolunteerSchema, UpdateVolunteerSchema } from "./volunteer-schemas";
import * as lib from "./volunteer-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const volunteers = await lib.getAllVolunteers();
    res.json({ volunteers });
  })
);

router.get(
  "/:id/signups",
  asyncHandler(async (req, res) => {
    const signups = await lib.getVolunteerSignups(req.params.id);
    res.json({ signups });
  })
);

router.get(
  "/:id/hours",
  asyncHandler(async (req, res) => {
    const result = await lib.getVolunteerHours(req.params.id);
    res.json(result);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const volunteer = await lib.getVolunteerById(req.params.id);
    res.json(volunteer);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateVolunteerSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const volunteer = await lib.createVolunteer(result.data);
    res.status(201).json(volunteer);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateVolunteerSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const volunteer = await lib.updateVolunteer(req.params.id, result.data);
    res.json(volunteer);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteVolunteer(req.params.id);
    res.status(204).send();
  })
);

export default router;

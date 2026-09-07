import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import {
  CreateShiftTemplateSchema,
  UpdateShiftTemplateSchema,
  EditOccurrenceSchema,
  SplitSeriesSchema,
} from "./shift-template-schemas";
import * as lib from "./shift-template-lib";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = PaginationSchema.parse(req.query);
    const { data: templates, pagination: meta } = await lib.getAllShiftTemplates(pagination);
    res.json({ templates, pagination: meta });
  })
);

router.get(
  "/:id/occurrences",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string>;
    if (!from || !to) {
      throw new APIError(400, "BadRequest", "from and to query params are required");
    }
    const occurrences = await lib.getSeriesOccurrences(
      req.params.id,
      new Date(from),
      new Date(to)
    );
    res.json({ occurrences });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await lib.getShiftTemplateById(req.params.id);
    res.json(template);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = CreateShiftTemplateSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const template = await lib.createShiftTemplate(result.data);
    res.status(201).json(template);
  })
);

// Edit the whole series (field changes propagate; schedule change rejected once
// occurrences exist).
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateShiftTemplateSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const template = await lib.updateShiftTemplate(req.params.id, result.data);
    res.json(template);
  })
);

// Edit a single occurrence (materialize + detach + apply).
router.put(
  "/:id/occurrences",
  asyncHandler(async (req, res) => {
    const result = EditOccurrenceSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const shift = await lib.editOccurrence(req.params.id, result.data);
    res.json(shift);
  })
);

// This and following: split the series at an occurrence.
router.put(
  "/:id/split",
  asyncHandler(async (req, res) => {
    const result = SplitSeriesSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const out = await lib.splitSeries(req.params.id, result.data);
    res.json(out);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await lib.deleteShiftTemplate(req.params.id);
    res.status(204).send();
  })
);

export default router;

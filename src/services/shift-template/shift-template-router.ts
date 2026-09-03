import { Router } from "express";
import { asyncHandler, APIError } from "../../common/errors";
import { PaginationSchema } from "../../common/paginate";
import { CreateShiftTemplateSchema, UpdateShiftTemplateSchema } from "./shift-template-schemas";
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

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = UpdateShiftTemplateSchema.safeParse(req.body);
    if (!result.success) throw new APIError(400, "BadRequest", result.error.message);
    const template = await lib.updateShiftTemplate(req.params.id, result.data);
    res.json(template);
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

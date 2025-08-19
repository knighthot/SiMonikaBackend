import { Router } from "express";
import * as c from "../controllers/historyPeramalan.controller.js";
import { validate } from "../middleware/validate.js";
import { createHistoryPeramalanSchema, updateHistoryPeramalanSchema } from "../schemas/historyPeramalan.schema.js";
import { requireAuth } from "../middleware/auth.js";
import { forceQueryOwnTambak, forceBodyOwnTambak } from "../middleware/scope.js";

const r = Router();

r.get("/", requireAuth, forceQueryOwnTambak, c.list);
r.get("/:id", requireAuth, c.getById);
r.post("/", requireAuth, forceBodyOwnTambak, validate(createHistoryPeramalanSchema), c.create);
r.put("/:id", requireAuth, forceBodyOwnTambak, validate(updateHistoryPeramalanSchema), c.update);
r.delete("/:id", requireAuth, c.remove);

export default r;

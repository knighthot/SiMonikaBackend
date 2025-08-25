import { Router } from "express";
import * as c from "../controllers/history.controller.js";
import { validate } from "../middleware/validate.js";
import { createHistorySchema, updateHistorySchema } from "../schemas/history.schema.js";
import { requireAuth } from "../middleware/auth.js";
import { forceQueryOwnTambak, forceBodyOwnTambak } from "../middleware/scope.js";

const r = Router();

r.get("/", requireAuth, forceQueryOwnTambak, c.list);
r.get("/:id", requireAuth, c.getById);
r.post("/", requireAuth, forceBodyOwnTambak, validate(createHistorySchema), c.create);
r.put("/:id", requireAuth, forceBodyOwnTambak, validate(updateHistorySchema), c.update);
r.delete("/:id", requireAuth, c.remove);
// tambah 1 baris route baru:
r.get("/trend", requireAuth, forceQueryOwnTambak, c.trend);


export default r;

import { Router } from "express";
import * as c from "../controllers/tambak.controller.js";
import { validate } from "../middleware/validate.js";
import { createTambakSchema, updateTambakSchema } from "../schemas/tambak.schema.js";
import { requireAuth ,requireRole  } from "../middleware/auth.js";
import { onlyOwnTambakParam } from "../middleware/scope.js";

const r = Router();

r.get("/", requireAuth, requireRole("ADMIN"), c.list);              // list semua tambak hanya ADMIN
r.get("/:id", requireAuth, onlyOwnTambakParam, c.getById);          // USER hanya boleh lihat tambaknya sendiri
r.post("/", requireAuth, requireRole("ADMIN"), validate(createTambakSchema), c.create);
r.put("/:id", requireAuth, requireRole("ADMIN"), validate(updateTambakSchema), c.update);
r.delete("/:id", requireAuth, requireRole("ADMIN"), c.remove);

export default r;

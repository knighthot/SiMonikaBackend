import { Router } from "express";
import * as c from "../controllers/tambak.controller.js";
import { validate } from "../middleware/validate.js";
import { createTambakSchema, updateTambakSelfSchema, updateTambakSchema } from "../schemas/tambak.schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { onlyOwnTambakParam } from "../middleware/scope.js";

const r = Router();

// update tambak milik user login
r.put("/self", requireAuth, c.updateSelf);
r.get("/", requireAuth, requireRole("ADMIN"), c.list);              // list semua tambak hanya ADMIN       
r.post("/", requireAuth, requireRole("ADMIN"), validate(createTambakSchema), c.create);
r.put("/:id", requireAuth, requireRole("ADMIN"), validate(updateTambakSchema), c.update);
r.delete("/:id", requireAuth, requireRole("ADMIN"), c.remove);

// USER biasa: lihat & update milik sendiri
r.get("/:id", requireAuth, onlyOwnTambakParam, c.getById);

// ======== NEW: self endpoints (untuk user biasa) ========

// fallback kompat: jika FE lama memanggil /:id/self
r.put("/:id/self", requireAuth, onlyOwnTambakParam, c.updateSelf);

export default r;

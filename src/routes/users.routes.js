import { Router } from "express";
import * as c from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema, updateUserSelfSchema } from "../schemas/users.schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const r = Router();

r.put("/me", requireAuth, c.updateMe);

// (opsional) r.get("/me", requireAuth, c.getMe);
r.get("/", requireAuth, requireRole("ADMIN"), c.list);
r.get("/:id", requireAuth, requireRole("ADMIN"), c.getById);
r.post("/", requireAuth, requireRole("ADMIN"), validate(createUserSchema), c.create);
r.put("/:id", requireAuth, requireRole("ADMIN"), validate(updateUserSchema), c.update);
r.delete("/:id", requireAuth, requireRole("ADMIN"), c.remove);

// ======== NEW: update profil milik user login ========

export default r;

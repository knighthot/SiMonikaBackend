import { Router } from "express";
import * as c from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../schemas/users.schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const r = Router();

r.get("/", requireAuth, requireRole("ADMIN"), c.list);
r.get("/:id", requireAuth, requireRole("ADMIN"), c.getById);
r.post("/", requireAuth, requireRole("ADMIN"), validate(createUserSchema), c.create);
r.put("/:id", requireAuth, requireRole("ADMIN"), validate(updateUserSchema), c.update);
r.delete("/:id", requireAuth, requireRole("ADMIN"), c.remove);

export default r;

import { Router } from "express";
import * as c from "../controllers/perangkat.controller.js";
import { validate } from "../middleware/validate.js";
import { createPerangkatSchema, updatePerangkatSchema } from "../schemas/perangkat.schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const r = Router();

r.get("/", requireAuth, c.list);
r.get("/:id", requireAuth, c.getById);
r.post("/", requireAuth, requireRole("ADMIN"), validate(createPerangkatSchema), c.create);
r.put("/:id", requireAuth, requireRole("ADMIN"), validate(updatePerangkatSchema), c.update);
r.delete("/:id", requireAuth, requireRole("ADMIN"), c.remove);

export default r;

import { Router } from "express";
import { register, login, me } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

r.post("/register", validate(registerSchema), register);
r.post("/login", validate(loginSchema), login);
r.get("/me", requireAuth, me);

export default r;

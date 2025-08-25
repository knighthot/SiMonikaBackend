import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiSummary } from "../controllers/ai.controller.js";

const r = Router();
r.post("/summary", requireAuth, aiSummary);  // POST /api/ai/summary
export default r;

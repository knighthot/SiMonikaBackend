import { Router } from "express";
import { forecastDummy } from "../controllers/peramalan.controller.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

// pakai auth biar konsisten dgn route lain (boleh dilepas kalau perlu publik)
r.post("/forecast", requireAuth, forecastDummy);

export default r;

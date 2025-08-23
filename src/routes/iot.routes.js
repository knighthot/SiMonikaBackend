// src/routes/iot.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { registerIotSchema } from "../schemas/iot.schema.js";
import { registerIot } from "../controllers/iot.controller.js";
import {
  attachSSE,
  getLast,
  stopSim,
  startAll as startAllSims,
  stopAll as stopAllSims,
  startSim,
} from "../services/iot.simulator.js";
import { canAccessIot } from "../middleware/iotAccess.js";

const r = Router();

// ADMIN saja
r.post("/register", requireAuth, requireRole("ADMIN"), validate(registerIotSchema), registerIot);

// Start semua simulator
r.post("/ingest", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const running = await startAllSims({ persist: true });
    res.json({ ok: true, running });
  } catch (e) { next(e); }
});

// Start satu simulator
r.post("/ingest/:deviceId", requireAuth, requireRole("ADMIN"), (req, res, next) => {
  try {
    const id = String(req.params.deviceId);
    startSim(id, { persist: true });
    res.json({ ok: true, started: id });
  } catch (e) { next(e); }
});

// Stream SSE + last (cek akses pakai canAccessIot)
r.get("/sim/:iotId/stream", requireAuth, canAccessIot, (req, res) => {
  attachSSE(req.params.iotId, res, { persist: true });
});

r.get("/sim/:iotId/last", requireAuth, canAccessIot, (req, res) => {
  const last = getLast(req.params.iotId);
  if (!last) return res.status(404).json({ message: "Simulator belum jalan" });
  res.json({ ID_PerangkatIot: String(req.params.iotId), Parameter: last, ts: new Date().toISOString() });
});

// Stop satu / stop semua
r.post("/sim/:iotId/stop", requireAuth, requireRole("ADMIN"), (req, res) => {
  stopSim(req.params.iotId);
  res.json({ ok: true });
});

r.post("/sim/stop-all", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await stopAllSims();
  res.json({ ok: true });
});

export default r;

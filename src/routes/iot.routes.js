import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js"; // ⬅️ tambah requireRole
import { validate } from "../middleware/validate.js";
import { registerIotSchema } from "../schemas/iot.schema.js";
import { registerIot } from "../controllers/iot.controller.js";
import { attachSSE, getLast, stopSim } from "../services/iot.simulator.js";
import { canAccessIot } from "../middleware/iotAccess.js"; // ⬅️ middleware akses (di bawah)

const r = Router();

// ❗️HANYA ADMIN yang boleh daftar/link & start simulator
r.post("/register", requireAuth, requireRole("ADMIN"), validate(registerIotSchema), registerIot);

// USER boleh stream/polling kalau perangkat itu tertaut ke tambaknya
r.get("/sim/:iotId/stream", requireAuth, canAccessIot, (req, res) => {
  attachSSE(req.params.iotId, res, { persist: true });
});

r.get("/sim/:iotId/last", requireAuth, canAccessIot, (req, res) => {
  const last = getLast(req.params.iotId);
  if (!last) return res.status(404).json({ message: "Simulator belum jalan" });
  res.json({ ID_PerangkatIot: String(req.params.iotId), Parameter: last, ts: new Date().toISOString() });
});

// (opsional) stop sim: ADMIN saja
r.post("/sim/:iotId/stop", requireAuth, requireRole("ADMIN"), (req, res) => {
  stopSim(req.params.iotId);
  res.json({ ok: true });
});

export default r;

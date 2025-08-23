// src/services/iot.simulator.js
import { TB_Perangkat, TB_Tambak, TB_History } from "../models/index.js";

/** ====== Ambang Kerapu Cantang ====== */
const THRESHOLDS = {
  Suhu:      { MIN: 26,  MAX: 34 },   // °C (ideal 28–32)
  pH:        { MIN: 7.2, MAX: 8.8 },  // unitless
  Salinitas: { MIN: 24,  MAX: 35 },   // ppt
  Kekeruhan: { MIN: 0,   MAX: 60 }    // NTU
};

// ====== Parameter simulator ======
const TICK_MS = 1000;            // 1 Hz
const MISSING_TIMEOUT_MS = 5000; // >5s dianggap sensor "hilang"
const DROP_PROB_PER_TICK = 0.08; // 8% peluang hilang paket pada 1 sensor/tick
const ANOMALY_CHANCE = 0.12;     // 12% tick memaksa anomali

const sims = new Map(); // Map<ID_PerangkatIot, SimState>

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const drift = (v, step, min, max) => clamp(v + (Math.random() * 2 - 1) * step, min, max);

function newReading(prev) {
  const ranges = {
    Suhu:       { min: 24, max: 34, step: 0.25 },
    pH:         { min: 6.8, max: 8.8, step: 0.06 },
    Salinitas:  { min: 10, max: 35, step: 0.35 },
    Kekeruhan:  { min: 5,  max: 80, step: 2.5 }
  };
  const base = prev || { Suhu: 28, pH: 7.6, Salinitas: 25, Kekeruhan: 15 };
  const next = {
    Suhu:       drift(base.Suhu,       ranges.Suhu.step,      ranges.Suhu.min,      ranges.Suhu.max),
    pH:         drift(base.pH,         ranges.pH.step,        ranges.pH.min,        ranges.pH.max),
    Salinitas:  drift(base.Salinitas,  ranges.Salinitas.step, ranges.Salinitas.min, ranges.Salinitas.max),
    Kekeruhan:  drift(base.Kekeruhan,  ranges.Kekeruhan.step, ranges.Kekeruhan.min, ranges.Kekeruhan.max),
  };
  // opsional: pembulatan 2 desimal
  for (const k of Object.keys(next)) next[k] = Number(next[k].toFixed(3));
  return next;
}

function isAnomali(p) {
  return (
    p.Suhu      < THRESHOLDS.Suhu.MIN      || p.Suhu      > THRESHOLDS.Suhu.MAX      ||
    p.pH        < THRESHOLDS.pH.MIN        || p.pH        > THRESHOLDS.pH.MAX        ||
    p.Salinitas < THRESHOLDS.Salinitas.MIN || p.Salinitas > THRESHOLDS.Salinitas.MAX ||
    p.Kekeruhan < THRESHOLDS.Kekeruhan.MIN || p.Kekeruhan > THRESHOLDS.Kekeruhan.MAX
  );
}

async function persistToHistory(ID_PerangkatIot, param) {
  const dev = await TB_Perangkat.findOne({ where: { ID_PerangkatIot: String(ID_PerangkatIot) } });
  if (!dev) return;
  const tambaks = await TB_Tambak.findAll({
    where: { ID_Perangkat: dev.ID_Perangkat },
    attributes: ["ID_Tambak"]
  });
  if (!tambaks.length) return;

  const now = new Date();
  const rows = tambaks.map(t => ({
    ID_Tambak: t.ID_Tambak,
    Waktu_History: now,
    pH: param.pH,
    suhu: param.Suhu,
    kekeruhan: param.Kekeruhan,
    salinitas: param.Salinitas
  }));
  await TB_History.bulkCreate(rows, { validate: true });
}

const SENSOR_KEYS = ["Suhu", "pH", "Salinitas", "Kekeruhan"];
const randomKey = () => SENSOR_KEYS[Math.floor(Math.random() * SENSOR_KEYS.length)];

function forceAnomaly(key, val) {
  const th = THRESHOLDS[key];
  if (!th) return val;
  const high = Math.random() < 0.5;
  switch (key) {
    case "Kekeruhan":  return Number((high ? th.MAX + 20 + Math.random() * 30 : Math.max(0, th.MIN - 10)).toFixed(3));
    case "pH":         return Number((high ? th.MAX + 0.6 : th.MIN - 0.6).toFixed(3));
    case "Suhu":       return Number((high ? th.MAX + 2.5 : th.MIN - 2.5).toFixed(3));
    case "Salinitas":  return Number((high ? th.MAX + 3.5 : Math.max(0, th.MIN - 3.5)).toFixed(3));
    default:           return val;
  }
}

function calcStatus(last, lastUpdated) {
  const now = Date.now();
  const missingSensors = SENSOR_KEYS.filter(k => now - lastUpdated[k] > MISSING_TIMEOUT_MS);
  if (missingSensors.length) return { status: "error", missingSensors };
  return { status: isAnomali(last) ? "anomali" : "ok", missingSensors: [] };
}

export function startSim(ID_PerangkatIot, { persist = true } = {}) {
  const id = String(ID_PerangkatIot);
  if (sims.has(id)) return sims.get(id);

  let last = newReading();
  const lastUpdated = { Suhu: Date.now(), pH: Date.now(), Salinitas: Date.now(), Kekeruhan: Date.now() };
  const listeners = new Set();

  // update LastSeenAt, throttled
  let lastSavedAlive = 0;
  async function markAlive() {
    const now = Date.now();
    if (now - lastSavedAlive < 4000) return;
    lastSavedAlive = now;
    try {
      await TB_Perangkat.update(
        { LastSeenAt: new Date(now) },
        { where: { ID_PerangkatIot: id } }
      );
    } catch {}
  }

  const timer = setInterval(async () => {
    // kandidat next value
    const candidate = newReading(last);

    // simulasi paket hilang pada 1 sensor
    const drop = Math.random() < DROP_PROB_PER_TICK ? randomKey() : null;

    // terapkan update:
    for (const k of SENSOR_KEYS) {
      if (drop && k === drop) continue;  // sensor ini "diam" di tick ini
      last[k] = candidate[k];
      lastUpdated[k] = Date.now();
    }

    // injeksi anomali acak (sesekali)
    if (Math.random() < ANOMALY_CHANCE) {
      const ak = randomKey();
      last[ak] = forceAnomaly(ak, last[ak]);
      lastUpdated[ak] = Date.now();
    }

    // hitung status & sensor yang hilang
    const { status, missingSensors } = calcStatus(last, lastUpdated);

    // tandai perangkat hidup (agar FE bisa set status Aktif)
    markAlive();

    // persist history bila diminta & bukan error (supaya data history “bersih”)
    if (persist && status !== "error") {
      try { await persistToHistory(id, last); } catch {}
    }

    // broadcast SSE
    const payload = {
      ID_PerangkatIot: id,
      Parameter: { ...last },
      status,
      missingSensors,
      ts: new Date().toISOString()
    };

    for (const res of Array.from(listeners)) {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (status === "error") {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "sensor timeout > 5s", missingSensors })}\n\n`);
        }
      } catch {
        listeners.delete(res);
      }
    }
  }, TICK_MS);

  const state = {
    id,
    get last() { return last; },
    listeners,
    stop() { clearInterval(timer); sims.delete(id); }
  };

  sims.set(id, state);
  return state;
}

export function stopSim(ID_PerangkatIot) {
  const s = sims.get(String(ID_PerangkatIot));
  if (s) s.stop();
}

export function getLast(ID_PerangkatIot) {
  const s = sims.get(String(ID_PerangkatIot));
  return s ? s.last : null;
}

/** Pasang SSE; auto-start simulator bila belum jalan */
export function attachSSE(ID_PerangkatIot, res, { persist = true } = {}) {
  const sim = startSim(ID_PerangkatIot, { persist });
  sim.listeners.add(res);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // initial event
  const initial = sim.last;
  const initStatus = isAnomali(initial) ? "anomali" : "ok";
  res.write(`data: ${JSON.stringify({
    ID_PerangkatIot: String(ID_PerangkatIot),
    Parameter: initial,
    status: initStatus,
    missingSensors: [],
    ts: new Date().toISOString()
  })}\n\n`);

  const cleanup = () => { sim.listeners.delete(res); };
  res.on("close", cleanup);
  res.on("finish", cleanup);
}

// ===== util multi-device =====
export async function startAll({ persist = true } = {}) {
  const rows = await TB_Perangkat.findAll({ attributes: ["ID_PerangkatIot"] });
  for (const r of rows) startSim(r.ID_PerangkatIot, { persist });
  return Array.from(sims.keys());
}

export async function stopAll() {
  for (const [, s] of sims) s.stop();
  sims.clear();
}

export function listRunning() {
  return Array.from(sims.keys());
}

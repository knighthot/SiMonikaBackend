import { TB_Perangkat, TB_Tambak, TB_History } from "../models/index.js";

/** ====== Konfigurasi standar kerapu cantang ======
 *  Sesuaikan kalau perlu. "anomali" dipicu bila keluar dari MIN/MAX.
 */
const THRESHOLDS = {
  Suhu:      { MIN: 26,  MAX: 34 },   // °C (ideal 28–32)
  pH:        { MIN: 7.2, MAX: 8.8 },  // unitless (umum 7.5–8.5)
  Salinitas: { MIN: 24,  MAX: 35 },   // ppt
  Kekeruhan: { MIN: 0,   MAX: 60 }    // NTU (anomali bila >60)
};

// simulator tick interval & timeout error “sensor hilang”
const TICK_MS = 1000;
const MISSING_TIMEOUT_MS = 5000;
// peluang sebuah sensor “tidak kirim” pada satu tick (dummy)
const DROP_PROB_PER_TICK = 0.08;

const sims = new Map(); // Map<ID_PerangkatIot, SimState>

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const drift = (v, step, min, max) => clamp(v + (Math.random()*2 - 1) * step, min, max);

function newReading(prev) {
  const ranges = {
    Suhu:       { min: 24, max: 34, step: 0.2 },
    pH:         { min: 6.8, max: 8.8, step: 0.05 },
    Salinitas:  { min: 10, max: 35, step: 0.3 },
    Kekeruhan:  { min: 5,  max: 80, step: 2 }
  };
  const base = prev || { Suhu: 28, pH: 7.6, Salinitas: 25, Kekeruhan: 15 };
  return {
    Suhu:       drift(base.Suhu,       ranges.Suhu.step,      ranges.Suhu.min,      ranges.Suhu.max),
    pH:         drift(base.pH,         ranges.pH.step,        ranges.pH.min,        ranges.pH.max),
    Salinitas:  drift(base.Salinitas,  ranges.Salinitas.step, ranges.Salinitas.min, ranges.Salinitas.max),
    Kekeruhan:  drift(base.Kekeruhan,  ranges.Kekeruhan.step, ranges.Kekeruhan.min, ranges.Kekeruhan.max),
  };
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
  const tambaks = await TB_Tambak.findAll({ where: { ID_Perangkat: dev.ID_Perangkat }, attributes: ["ID_Tambak"] });
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

function chooseRandomKey(keys) {
  return keys[Math.floor(Math.random() * keys.length)];
}

/** Mulai simulator untuk sebuah ID_PerangkatIot */
export function startSim(ID_PerangkatIot, { persist = true } = {}) {
  const id = String(ID_PerangkatIot);
  if (sims.has(id)) return sims.get(id);

  let last = newReading();
  // catat kapan terakhir tiap sensor “update”
  const lastUpdated = {
    Suhu: Date.now(),
    pH: Date.now(),
    Salinitas: Date.now(),
    Kekeruhan: Date.now()
  };

  const listeners = new Set();

  const timer = setInterval(async () => {
    // generate kandidat pembacaan baru
    const next = newReading(last);

    // simulasi “packet loss” sensor: drop salah satu key dengan probabilitas
    const keys = Object.keys(next);
    if (Math.random() < DROP_PROB_PER_TICK) {
      const dropKey = chooseRandomKey(keys);
      // jangan update nilai & timestamp untuk sensor ini
      for (const k of keys) {
        if (k !== dropKey) {
          last[k] = next[k];
          lastUpdated[k] = Date.now();
        }
      }
    } else {
      // update normal semua sensor
      for (const k of keys) {
        last[k] = next[k];
        lastUpdated[k] = Date.now();
      }
    }

    // cek error: ada sensor yang "senyap" > 5 detik?
    const nowMs = Date.now();
    const missingSensors = keys.filter(k => nowMs - lastUpdated[k] > MISSING_TIMEOUT_MS);
    let status = "ok";
    if (missingSensors.length > 0) {
      status = "error";
    } else if (isAnomali(last)) {
      status = "anomali";
    }

    // persist ke DB jika tidak error
    if (persist && status !== "error") {
      try { await persistToHistory(id, last); } catch {}
    }

    const payload = {
      ID_PerangkatIot: id,
      Parameter: { ...last },
      status,
      missingSensors,
      ts: new Date().toISOString()
    };

    // broadcast SSE
    for (const res of [...listeners]) {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (status === "error") {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "sensor timeout > 5s", missingSensors })}\n\n`);
          // untuk dummy, kita biarkan stream tetap hidup; kalau mau putus, uncomment di bawah:
          // res.end(); listeners.delete(res);
        }
      } catch { listeners.delete(res); }
    }
  }, TICK_MS);

  const state = {
    id,
    get last(){ return last; },
    listeners,
    stop(){ clearInterval(timer); sims.delete(id); }
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

  res.write(`data: ${JSON.stringify({
    ID_PerangkatIot: String(ID_PerangkatIot),
    Parameter: sim.last,
    status: "ok",
    missingSensors: [],
    ts: new Date().toISOString()
  })}\n\n`);

  const cleanup = () => { sim.listeners.delete(res); };
  res.on("close", cleanup); res.on("finish", cleanup);
}

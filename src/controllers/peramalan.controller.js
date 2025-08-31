// src/controllers/peramalan.controller.js
import dayjs from "dayjs";
import { Op } from "sequelize";
import { doForecast } from "../services/forecast.service.js";
import { TB_AutoForecast, TB_HistoryPeramalan, TB_History } from "../models/index.js";

/* ===========================
 * Utils
 * =========================== */

// Naikkan ke awal jam berikutnya
function ceilToNextHour(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  x.setHours(x.getHours() + 1);
  return x;
}

// Konversi horizon+frequency ke jumlah hari yang diinginkan
function getDesiredDays(horizon, frequency) {
  const h = Number(horizon);
  if (!Number.isFinite(h) || h <= 0) return null;
  const f = String(frequency || "hourly").toLowerCase();
  if (f.includes("day")) return Math.ceil(h);       // daily: horizon = hari
  if (f.includes("hour")) return Math.ceil(h / 24); // hourly: horizon = jam
  return Math.ceil(h / 24);
}

// Clamp helper
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Skor linear (0..100) untuk range:
// - 100 di dalam [okMin, okMax]
// - Turun linear ke 0 pada [hardMin, okMin) dan (okMax, hardMax]
function scoreRange(value, okMin, okMax, hardMin, hardMax) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (v >= okMin && v <= okMax) return 100;
  if (v < okMin) {
    if (v <= hardMin) return 0;
    const span = okMin - hardMin;
    const pos = v - hardMin;
    return clamp((pos / span) * 100, 0, 100);
  }
  // v > okMax
  if (v >= hardMax) return 0;
  const span = hardMax - okMax;
  const pos = hardMax - v;
  return clamp((pos / span) * 100, 0, 100);
}

/**
 * Rumus WQI dummy berbobot:
 * - pH         ideal 7.5–8.5   (hard 6.5–9.5)   bobot 0.30
 * - Suhu       ideal 27–32 °C  (hard 24–35)     bobot 0.30
 * - Salinitas  ideal 28–35 ppt (hard 20–40)     bobot 0.25
 * - Kekeruhan  ideal 0–5 NTU   (hard 0–30)      bobot 0.15
 */
function computeWQI({ ph, suhu, salinitas, kekeruhan }) {
  const sPH = scoreRange(ph, 7.5, 8.5, 6.5, 9.5);
  const sT = scoreRange(suhu, 27, 32, 24, 35);
  const sSal = scoreRange(salinitas, 28, 35, 20, 40);
  // untuk kekeruhan: makin tinggi makin buruk → skorRange(0..5) bagus
  const sTurb = scoreRange(kekeruhan, 0, 5, 0, 30);

  const parts = [
    { v: sPH, w: 0.30 },
    { v: sT, w: 0.30 },
    { v: sSal, w: 0.25 },
    { v: sTurb, w: 0.15 },
  ].filter((p) => p.v != null);

  if (!parts.length) return null;
  const wsum = parts.reduce((a, b) => a + b.w, 0);
  const val = parts.reduce((a, b) => a + b.v * b.w, 0) / wsum;
  return Math.round(val * 10) / 10; // 1 desimal
}

/**
 * Ambil dummy per hari dari TB_History untuk ID_Tambak tertentu.
 * - Ambil data beberapa hari ke belakang
 * - Agregasi per hari (avg pH/suhu/salinitas/kekeruhan)
 * - Isi WQI dengan computeWQI
 * - Jika jumlah hari kurang dari desiredDays, carry-forward hari terakhir
 * - Range keluaran = mulai "hari ini" -> +desiredDays
 */
async function buildDummyFromHistory({ ID_Tambak, desiredDays }) {
  if (!ID_Tambak || !desiredDays || desiredDays <= 0) return [];
  const to = dayjs().endOf("day").toDate();
  const from = dayjs(to).subtract(Math.max(14, desiredDays + 5), "day").startOf("day").toDate();

  const rows = await TB_History.findAll({
    where: { ID_Tambak, Waktu_History: { [Op.between]: [from, to] } },
    order: [["Waktu_History", "ASC"]],
    attributes: ["Waktu_History", "pH", "suhu", "salinitas", "kekeruhan"],
  });
  // console.log("[DUMMY] TB_History fetched:", rows.length, "ID_Tambak:", ID_Tambak);

  // bucket by YYYY-MM-DD
  const byDay = new Map();
  for (const r of rows) {
    const day = dayjs(r.Waktu_History).format("YYYY-MM-DD");
    const acc = byDay.get(day) || { ph: [], suhu: [], salinitas: [], kekeruhan: [] };
    if (r.pH != null) acc.ph.push(Number(r.pH)); // kolom model: "pH"
    if (r.suhu != null) acc.suhu.push(Number(r.suhu));
    if (r.salinitas != null) acc.salinitas.push(Number(r.salinitas));
    if (r.kekeruhan != null) acc.kekeruhan.push(Number(r.kekeruhan));
    byDay.set(day, acc);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  let out = Array.from(byDay.entries())
    .map(([tanggal, v]) => {
      const ph = avg(v.ph);
      const suhu = avg(v.suhu);
      const salinitas = avg(v.salinitas);
      const kekeruhan = avg(v.kekeruhan);
      const wqi = computeWQI({ ph, suhu, salinitas, kekeruhan });
      return { tanggal, ph, suhu, salinitas, kekeruhan, wqi };
    })
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  // kalau kosong, seed default supaya tidak null semua
  if (out.length === 0) {
    const seed = {
      tanggal: dayjs().format("YYYY-MM-DD"),
      ph: 7.8,
      suhu: 30.5,
      salinitas: 32,
      kekeruhan: 3,
    };
    seed.wqi = computeWQI(seed);
    out = [seed];
  }

  // Isi deret mulai hari ini sepanjang desiredDays: gunakan data yang ada; jika tidak ada, carry-forward terakhir
  const today = dayjs().startOf("day");
  const filled = [];
  for (let i = 0; i < desiredDays; i++) {
    const t = today.add(i, "day").format("YYYY-MM-DD");
    const exact = out.find((x) => x.tanggal === t);
    if (exact) {
      filled.push(exact);
    } else {
      const last = filled[filled.length - 1] || out[out.length - 1];
      filled.push({ ...last, tanggal: t });
    }
  }
  return filled;
}

/**
 * Normalisasi payload.forecast (hourly / mixed) menjadi array harian
 * format: [{tanggal, ph, suhu, salinitas, kekeruhan, wqi}]
 * + clamp ke desiredDays jika diisi
 * + BACA NILAI NESTED (".p50") untuk struktur seperti { PH: { p50: 8.1, ... } }
 */
function normalizeForecastToDaily(payload, { desiredDays } = {}) {
  const toDateOnly = (raw) => new Date(raw).toISOString().slice(0, 10);
  const num = (v) =>
    v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

  // Ambil angka dari salah satu key; jika obj[key] adalah OBJECT, ambil p50/median/mean/value
  function pickVal(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "object") {
        if ("p50" in v) return num(v.p50);
        if ("median" in v) return num(v.median);
        if ("mean" in v) return num(v.mean);
        if ("value" in v) return num(v.value);
        continue;
      }
      return num(v);
    }
    return null;
  }

  const readTime = (p) =>
    p?.tanggal ?? p?.date ?? p?.time ?? p?.ts ?? p?.timestamp ?? p?.at ?? p?.day ?? p;

  // sumber forecast utama
  const src = Array.isArray(payload?.forecast)
    ? payload.forecast
    : Array.isArray(payload?.daily)
      ? payload.daily
      : [];

  const bucket = new Map();
  for (const p of src) {
    const t = readTime(p);
    if (!t) continue;
    const key = toDateOnly(t);

    const acc = bucket.get(key) || { ph: [], suhu: [], salinitas: [], kekeruhan: [], wqi: [] };
    // alias termasuk kapital sesuai debug: "Suhu","PH","Salinitas","Kekeruhan"
    const ph = pickVal(p, ["ph", "pH", "PH"]);
    const suhu = pickVal(p, ["suhu", "Suhu", "temperature", "temp", "Temp"]);
    const sal = pickVal(p, ["salinitas", "Salinitas", "salinity", "sal", "ppt", "Salinity"]);
    const turb = pickVal(p, ["kekeruhan", "Kekeruhan", "turbidity", "ntu", "NTU"]);
    const wqi = pickVal(p, ["wqi", "WQI", "wqiIndex", "wqi_pred"]);

    if (ph !== null) acc.ph.push(ph);
    if (suhu !== null) acc.suhu.push(suhu);
    if (sal !== null) acc.salinitas.push(sal);
    if (turb !== null) acc.kekeruhan.push(turb);
    if (wqi !== null) acc.wqi.push(wqi);
    bucket.set(key, acc);
  }

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let forecastOut = Array.from(bucket.entries())
    .map(([tanggal, v]) => {
      const ph = avg(v.ph);
      const suhu = avg(v.suhu);
      const salinitas = avg(v.salinitas);
      const kekeruhan = avg(v.kekeruhan);
      // jika wqi tidak ada dari sumber, hitung dari parameter
      const wqiSource = avg(v.wqi);
      const wqi =
        wqiSource != null ? wqiSource : computeWQI({ ph, suhu, salinitas, kekeruhan });
      return { tanggal, ph, suhu, salinitas, kekeruhan, wqi };
    })
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  if (Number.isInteger(desiredDays) && desiredDays > 0) {
    forecastOut = forecastOut.slice(0, desiredDays);
  }

  // rata2 wqi periode
  const wqiAggArr = forecastOut.map((x) => x.wqi).filter((x) => x != null);
  const wqiAgg =
    wqiAggArr.length
      ? Math.round((wqiAggArr.reduce((a, b) => a + b, 0) / wqiAggArr.length) * 10) / 10
      : null;

  return { forecastOut, wqiAgg };
}

/* ===========================
 * Controllers
 * =========================== */

/**
 * POST /api/peramalan/forecast
 * Body: { id_tambak, id_perangkat_iot, horizon, frequency, history_range }
 * Response: array harian [{tanggal, ph, suhu, salinitas, kekeruhan, wqi}]
 * Simpan history ke TB_HistoryPeramalan sesuai skema baru.
 * Tambahkan `?debug=1` untuk payload debug.
 */
export const forecast = async (req, res) => {
  try {
    const debug = req.query?.debug === "1";

    const { id_tambak, id_perangkat_iot, horizon, frequency, history_range } = req.body || {};
    const payload = await doForecast({
      id_tambak,
      id_perangkat_iot,
      horizon,
      frequency,
      history_range,
    });

    const desiredDays = getDesiredDays(horizon, frequency);
    let { forecastOut, wqiAgg } = normalizeForecastToDaily(payload, { desiredDays });

    const noData =
      !forecastOut.length ||
      forecastOut.every(
        (d) =>
          d.ph == null && d.suhu == null && d.salinitas == null && d.kekeruhan == null && d.wqi == null
      );

    let _used_fallback = false;
    if ((noData || (desiredDays && forecastOut.length < desiredDays)) && desiredDays) {
      forecastOut = await buildDummyFromHistory({ ID_Tambak: id_tambak, desiredDays });
      const wArr = forecastOut.map((x) => x.wqi).filter((x) => x != null);
      wqiAgg = wArr.length
        ? Math.round((wArr.reduce((a, b) => a + b, 0) / wArr.length) * 10) / 10
        : null;
      _used_fallback = true;
    }

    const now = new Date();
    await TB_HistoryPeramalan.create({
      ID_Tambak: id_tambak,
      ID_PerangkatIot: id_perangkat_iot || null,
      Tanggal_Awal: forecastOut[0]?.tanggal || now.toISOString().slice(0, 10),
      Tanggal_Akhir:
        forecastOut.length ? forecastOut[forecastOut.length - 1].tanggal : now.toISOString().slice(0, 10),
      Jumlah_Hari: Math.max(1, forecastOut.length),
      Data_WQI: { wqi: wqiAgg },
      Data_Parameter: forecastOut,
      Waktu_Hit_API: now,
      // metadata opsional (kalau kolomnya ada)
      Payload: payload,
      IssuedAt: payload?.meta?.issued_at,
      Horizon: payload?.meta?.horizon,
      Frequency: payload?.meta?.frequency,
      WindowStart: null,
      WindowEnd: null,
    });

    if (!debug) return res.json(forecastOut);

    // MODE DEBUG: kirimkan info tambahan
    const firstRaw = Array.isArray(payload?.forecast) ? payload.forecast[0] : null;

    // re-use pickVal untuk example parse
    const num = (v) =>
      v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
    function pickVal(obj, keys) {
      if (!obj) return null;
      for (const k of keys) {
        const v = obj[k];
        if (v === undefined || v === null) continue;
        if (typeof v === "object") {
          if ("p50" in v) return num(v.p50);
          if ("median" in v) return num(v.median);
          if ("mean" in v) return num(v.mean);
          if ("value" in v) return num(v.value);
          continue;
        }
        return num(v);
      }
      return null;
    }

    const histSample = await TB_History.findOne({
      where: { ID_Tambak: id_tambak },
      order: [["Waktu_History", "DESC"]],
      attributes: ["Waktu_History", "pH", "suhu", "salinitas", "kekeruhan"],
    });

    return res.json({
      _debug: {
        request: { id_tambak, id_perangkat_iot, horizon, frequency, desiredDays },
        doForecast_meta: payload?.meta || null,
        doForecast_firstItem: firstRaw || null,
        doForecast_firstItem_keys: firstRaw ? Object.keys(firstRaw) : null,
        forecastOut_len: forecastOut.length,
        forecastOut_first: forecastOut[0] || null,
        wqiAgg,
        TB_History_latest: histSample || null,
        _used_fallback,
        _parser_sample: firstRaw
          ? {
            ph: pickVal(firstRaw, ["ph", "pH", "PH"]),
            suhu: pickVal(firstRaw, ["suhu", "Suhu", "temperature", "temp", "Temp"]),
            sal: pickVal(firstRaw, ["salinitas", "Salinitas", "salinity", "sal", "ppt", "Salinity"]),
            turb: pickVal(firstRaw, ["kekeruhan", "Kekeruhan", "turbidity", "ntu", "NTU"]),
          }
          : null,
      },
      data: forecastOut,
    });
  } catch (e) {
    const code = e?.status || 500;
    res.status(code).json({ message: e?.message || "forecast failed" });
  }
};

/**
 * POST /api/peramalan/auto/start
 * Body: { id_tambak, id_perangkat_iot, window_start?, window_end?, frequency?="hourly", horizon?=168 }
 * Mengaktifkan/konfigurasi auto-forecast job.
 */
export const autoStart = async (req, res, next) => {
  try {
    const {
      id_tambak,
      id_perangkat_iot,
      window_start,
      window_end,
      frequency = "hourly",
      horizon = 168,
    } = req.body || {};
    if (!id_tambak || !id_perangkat_iot)
      return res.status(400).json({ message: "id_tambak & id_perangkat_iot required" });

    const [row, created] = await TB_AutoForecast.findOrCreate({
      where: { ID_Tambak: id_tambak, ID_PerangkatIot: id_perangkat_iot },
      defaults: {
        WindowStart: new Date(window_start || new Date()),
        WindowEnd: new Date(window_end || new Date(Date.now() + 7 * 864e5)),
        Frequency: frequency,
        Horizon: horizon,
        Active: true,
        NextDueAt: ceilToNextHour(), // mulai jam depan
      },
    });

    if (!created) {
      // update konfigurasi + aktifkan
      row.WindowStart = new Date(window_start || row.WindowStart);
      row.WindowEnd = new Date(window_end || row.WindowEnd);
      row.Frequency = frequency;
      row.Horizon = horizon;
      row.Active = true;

      // cooldown kecil agar tidak flood start berulang
      const now = new Date();
      const minNext = new Date(row.LastRunAt || 0);
      minNext.setMinutes(minNext.getMinutes() + (row.CooldownMin || 5));
      row.NextDueAt = now < minNext ? minNext : ceilToNextHour(now);
      await row.save();
      return res.json({ ok: true, updated: true, next_due_at: row.NextDueAt });
    }

    res.json({ ok: true, created: true, next_due_at: row.NextDueAt });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/peramalan/auto/stop
 * Body: { id_tambak, id_perangkat_iot }
 * Menonaktifkan auto-forecast job.
 */
export const autoStop = async (req, res, next) => {
  try {
    const { id_tambak, id_perangkat_iot } = req.body || {};
    if (!id_tambak || !id_perangkat_iot)
      return res.status(400).json({ message: "id_tambak & id_perangkat_iot required" });

    const row = await TB_AutoForecast.findOne({
      where: { ID_Tambak: id_tambak, ID_PerangkatIot: id_perangkat_iot },
    });
    if (!row) return res.status(404).json({ message: "not found" });

    row.Active = false;
    await row.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET/POST /api/peramalan/auto/tick
 * Jalankan semua job Active yang due, simpan history (format baru), dan jadwalkan lagi +1 jam
 */
export async function autoForecastTick(req, res, next) {
  const run = async () => {
    const now = new Date();

    const jobs = await TB_AutoForecast.findAll({
      where: { Active: true, NextDueAt: { [Op.lte]: now } },
    });

    let ran = 0;
    for (const job of jobs) {
      try {
        const payload = await doForecast({
          id_tambak: job.ID_Tambak,
          id_perangkat_iot: job.ID_PerangkatIot,
          horizon: job.Horizon || 168,
          frequency: job.Frequency || "hourly",
          history_range: null,
        });

        const desiredDays = getDesiredDays(job.Horizon, job.Frequency);
        let { forecastOut, wqiAgg } = normalizeForecastToDaily(payload, { desiredDays });

        const noData =
          !forecastOut.length ||
          forecastOut.every(
            (d) =>
              d.ph == null &&
              d.suhu == null &&
              d.salinitas == null &&
              d.kekeruhan == null &&
              d.wqi == null
          );

        if ((noData || (desiredDays && forecastOut.length < desiredDays)) && desiredDays) {
          const dummy = await buildDummyFromHistory({ ID_Tambak: job.ID_Tambak, desiredDays });
          forecastOut = dummy;
          const wArr = dummy.map((x) => x.wqi).filter((x) => x != null);
          wqiAgg = wArr.length
            ? Math.round((wArr.reduce((a, b) => a + b, 0) / wArr.length) * 10) / 10
            : null;
        }

        const start = job.WindowStart || now;
        const end = job.WindowEnd || dayjs(now).add(7, "day").toDate();

        await TB_HistoryPeramalan.create({
          ID_Tambak: job.ID_Tambak,
          ID_PerangkatIot: job.ID_PerangkatIot,
          Tanggal_Awal: forecastOut[0]?.tanggal || dayjs(start).format("YYYY-MM-DD"),
          Tanggal_Akhir:
            forecastOut.length
              ? forecastOut[forecastOut.length - 1].tanggal
              : dayjs(end).format("YYYY-MM-DD"),
          Jumlah_Hari: Math.max(1, forecastOut.length),
          Data_WQI: { wqi: wqiAgg },
          Data_Parameter: forecastOut,
          Waktu_Hit_API: new Date(),
          // opsional metadata:
          Payload: payload,
          IssuedAt: payload?.meta?.issued_at,
          Horizon: payload?.meta?.horizon,
          Frequency: job.Frequency,
          WindowStart: start,
          WindowEnd: end,
        });

        job.LastRunAt = now;
        job.NextDueAt = dayjs(now).add(1, "hour").startOf("hour").toDate();
        await job.save();

        ran++;
      } catch (err) {
        job.FailCount = (job.FailCount || 0) + 1;
        job.LastError = String(err?.message || err);
        job.NextDueAt = dayjs().add(1, "hour").startOf("hour").toDate();
        await job.save();
        console.error("autoForecastTick job error:", err);
      }
    }

    return { now, due: jobs.length, ran };
  };

  if (res && typeof res.json === "function") {
    try {
      const out = await run();
      res.json({ ok: true, ...out });
    } catch (e) {
      next?.(e);
    }
  } else {
    return run();
  }
}

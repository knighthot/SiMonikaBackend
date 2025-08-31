// ai.controller.js
import dayjs from "dayjs";
import OpenAI from "openai";
import { TB_HistoryPeramalan } from "../models/index.js";

/** Aman: tidak throw kalau key kosong */
function getMaybeKey() {
  return process.env.OPEN_AI_KEY || process.env.OPENAI_API_KEY || null;
}

/** Batas aman (laut) */
const SAFE_RANGE = {
  suhu: { min: 26, max: 34 },
  ph: { min: 7, max: 9 },
  sal: { min: 10, max: 30 },
  turb: { max: 200 },
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalisasi 1 baris forecast → {ts,Suhu,PH,Salinitas,Kekeruhan,WQI,risk_label}
 *  - Mendukung data harian HistoryPeramalan: { tanggal, ph, suhu, salinitas, kekeruhan, wqi, ... }
 *  - Mendukung format lama/dummy: {Parameter:{...}} atau flat termasuk p50
 */
function normForecastRow(p) {
  const P = p?.Parameter ?? p ?? {};
  const asNum = (v) => (v && typeof v === "object" ? num(v.p50) : num(v));
  const PHx = P?.PH ?? P?.pH ?? P?.ph;
  const rawTs = p?.ts || P?.ts || P?.Timestamp || P?.time || P?.tanggal || null;

  return {
    ts: rawTs,
    Suhu: asNum(P?.Suhu ?? P?.suhu),
    PH: num(PHx && typeof PHx === "object" ? PHx.p50 : PHx),
    Salinitas: asNum(P?.Salinitas ?? P?.salinitas),
    Kekeruhan: asNum(P?.Kekeruhan ?? P?.kekeruhan),
    WQI: asNum(P?.WQI ?? P?.wqi) ?? asNum(p?.WQI ?? p?.wqi),
    risk_label: p?.risk_label ?? P?.risk_label ?? null,
  };
}

function stats(arr) {
  const xs = (arr || []).filter((v) => Number.isFinite(v));
  if (!xs.length) return { count: 0, min: null, max: null, mean: null };
  const s = xs.reduce((a, b) => a + b, 0);
  return {
    count: xs.length,
    min: Math.min(...xs),
    max: Math.max(...xs),
    mean: +(s / xs.length).toFixed(2),
  };
}

/** Ambil input efektif:
 *  - Jika body berisi sensor/forecast → pakai langsung.
 *  - Jika tidak → ambil dari TB_HistoryPeramalan terakhir (Data_Parameter = array harian).
 */
async function resolveInputs({ sensor, forecast, ID_Tambak }) {
  if ((sensor && Object.keys(sensor).length) || (forecast && forecast.length)) {
    const sensorNow = {
      Suhu: num(sensor?.Suhu ?? sensor?.suhu) ?? 0,
      PH: num(sensor?.PH ?? sensor?.pH ?? sensor?.ph) ?? 0,
      Salinitas: num(sensor?.Salinitas ?? sensor?.salinitas) ?? 0,
      Kekeruhan: num(sensor?.Kekeruhan ?? sensor?.kekeruhan) ?? 0,
    };
    return { sensorNow, sensorAt: null, forecast: forecast || [], source: "body" };
  }

  if (!ID_Tambak) {
    throw Object.assign(
      new Error("ID_Tambak is required when sensor/forecast not provided"),
      { status: 400 }
    );
  }

  const row = await TB_HistoryPeramalan.findOne({
    where: { ID_Tambak },
    order: [["createdAt", "DESC"]],
    attributes: ["Data_Parameter", "createdAt"],
  });
  if (!row) {
    throw Object.assign(
      new Error("No TB_HistoryPeramalan found for this tambak"),
      { status: 404 }
    );
  }

  const DP = row?.Data_Parameter || [];
  const sensorNow = { Suhu: 0, PH: 0, Salinitas: 0, Kekeruhan: 0 };
  const sensorAt = null;
  const fc = Array.isArray(DP) ? DP : [];
  return { sensorNow, sensorAt, forecast: fc, source: "historyperamalan" };
}

/** WQI helpers */
const WQI_RANK = { Tinggi: 0, Waspada: 1, Rendah: 2 };
function wqiLabel(v) {
  if (!Number.isFinite(v)) return null;
  if (v >= 80) return "Tinggi";
  if (v >= 60) return "Waspada";
  return "Rendah";
}
function worstStatus(a, b, rankMap) {
  const rank = rankMap || { Baik: 0, Waspada: 1, Buruk: 2 };
  if (!Object.prototype.hasOwnProperty.call(rank, a)) return b;
  if (!Object.prototype.hasOwnProperty.call(rank, b)) return a;
  return rank[b] > rank[a] ? b : a;
}

/** Status via parameter bila WQI tak ada */
function paramStatus(row) {
  if (row?.risk_label === "Buruk" || row?.risk_label === "Waspada" || row?.risk_label === "Baik") {
    return row.risk_label;
  }
  const s = row?.Suhu, p = row?.PH, sa = row?.Salinitas, t = row?.Kekeruhan;

  const bad =
    (Number.isFinite(s) && (s < SAFE_RANGE.suhu.min || s > SAFE_RANGE.suhu.max)) ||
    (Number.isFinite(p) && (p < SAFE_RANGE.ph.min || p > SAFE_RANGE.ph.max)) ||
    (Number.isFinite(sa) && (sa < SAFE_RANGE.sal.min || sa > SAFE_RANGE.sal.max)) ||
    (Number.isFinite(t) && (t > SAFE_RANGE.turb.max));

  const near =
    (Number.isFinite(s) && ((s >= 26 && s < 28) || (s > 32 && s <= 34))) ||
    (Number.isFinite(p) && ((p >= 7 && p < 7.5) || (p > 8.5 && p <= 9))) ||
    (Number.isFinite(sa) && ((sa >= 10 && sa < 15) || (sa > 25 && sa <= 30))) ||
    (Number.isFinite(t) && (t > 100 && t <= 200));

  if (bad) return "Buruk";
  if (near) return "Waspada";
  return "Baik";
}

/** Ambil hanya forecast masa depan & batasi hari; hasil disortir naik */
function sliceFutureForecast(fcEff, rangeDays = 7) {
  const now = Date.now();
  const days = Math.max(1, Math.min(30, Number(rangeDays) || 7)); // 1..30
  const until = dayjs(now).add(days, "day");

  const rows = [];
  for (const raw of fcEff || []) {
    const r = normForecastRow(raw);
    let tsStr = r.ts;
    if (!tsStr) continue;
    tsStr = String(tsStr);
    const ms = tsStr.length === 10 ? +new Date(tsStr + "T00:00:00Z") : +new Date(tsStr);
    if (!Number.isFinite(ms)) continue;
    if (ms <= now) continue;                 // masa lalu skip
    if (dayjs(ms).isAfter(until)) continue;  // di luar jendela skip
    rows.push({ ...r, ts: new Date(ms).toISOString() });
  }
  rows.sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
  return { rows, days };
}

/** Ringkas penjelasan parameter → frasa kecil */
function paramPhrase(mean, label) {
  if (!Number.isFinite(mean)) return `${label} tidak tersedia`;
  const ok =
    (label === "pH" && mean >= SAFE_RANGE.ph.min && mean <= SAFE_RANGE.ph.max) ||
    (label === "suhu" && mean >= SAFE_RANGE.suhu.min && mean <= SAFE_RANGE.suhu.max) ||
    (label === "salinitas" && mean >= SAFE_RANGE.sal.min && mean <= SAFE_RANGE.sal.max) ||
    (label === "kekeruhan" && mean <= SAFE_RANGE.turb.max);
  return ok ? `${label} dalam batas` : `${label} melewati batas`;
}

/** Potong agar 30–40 kata */
function clipWords(s, min = 30, max = 40) {
  const words = s.trim().split(/\s+/);
  if (words.length <= max && words.length >= min) return s.trim();
  if (words.length > max) return words.slice(0, max).join(" ").trim();
  return s.trim();
}

export const aiSummary = async (req, res) => {
  try {
    const { sensor, forecast, meta = {}, debug: debugReq, ID_Tambak, range_days } = req.body || {};
    const wantDebug = Boolean(debugReq ?? req.query?.debug);

    const { sensorNow, sensorAt, forecast: fcEff, source } =
      await resolveInputs({ sensor, forecast, ID_Tambak });

    // Pakai HANYA FORECAST untuk ringkasan
    const { rows: fwd, days } = sliceFutureForecast(
      fcEff,
      range_days ?? meta?.range?.days ?? 7
    );

    if (!fwd.length) {
      return res.status(400).json({
        message: "Tidak ada data peramalan ke depan dalam jendela yang diminta.",
      });
    }

    const startTs = fwd[0].ts;
    const endTs = fwd[fwd.length - 1].ts;

    // ==== STATUS UTAMA dari WQI (bila ada) ====
    const wqiVals = fwd.map(r => r.WQI).filter(v => Number.isFinite(v));
    const wqiPerRow = fwd.map(r => wqiLabel(r.WQI));
    let wqiOverall = "Tinggi"; // default "baik"
    for (const lab of wqiPerRow) {
      if (!lab) continue;
      wqiOverall = worstStatus(wqiOverall, lab, WQI_RANK);
      if (wqiOverall === "Rendah") break;
    }

    // Fallback ke parameter jika WQI tidak ada sama sekali
    if (!wqiVals.length) {
      let fcParam = "Baik";
      for (const r of fwd) {
        fcParam = worstStatus(fcParam, paramStatus(r));
        if (fcParam === "Buruk") break;
      }
      wqiOverall = fcParam === "Buruk" ? "Rendah" : fcParam === "Waspada" ? "Waspada" : "Tinggi";
    }

    // statistik MIN–MAX/mean untuk info parameter
    const stS = stats(fwd.map((r) => r.Suhu));
    const stP = stats(fwd.map((r) => r.PH));
    const stSa = stats(fwd.map((r) => r.Salinitas));
    const stT = stats(fwd.map((r) => r.Kekeruhan));
    const stW = stats(wqiVals);

    // ====== GENERASI TEKS 30–40 kata TANPA PREFIX TANGGAL ======
    const key = getMaybeKey();
    let content = "";
    const hints = [
      `WQI ${Number.isFinite(stW.mean) ? stW.mean : "-"} (${wqiOverall}).`,
      `Parameter:`,
      paramPhrase(stP.mean, "pH") + ",",
      paramPhrase(stS.mean, "suhu") + ",",
      paramPhrase(stSa.mean, "salinitas") + ",",
      paramPhrase(stT.mean, "kekeruhan") + ".",
      `Tindakan mengikuti status ${wqiOverall.toLowerCase()}.`
    ].join(" ");

    if (key) {
      try {
        const openai = new OpenAI({ apiKey: key });
        const system =
          "Kamu asisten kualitas air tambak LAUT. Tulis 30–40 kata, Bahasa Indonesia. " +
          "Awali dengan WQI (angka bila ada + label), lalu ringkas kondisi pH, suhu, salinitas, kekeruhan. " +
          "Jangan sarankan ganti air.";
        const userPrompt =
          `DATA:\n` +
          `WQI mean:${Number.isFinite(stW.mean) ? stW.mean : "-"} Label:${wqiOverall}; ` +
          `pH mean:${stP.mean}; Suhu mean:${stS.mean}; Salinitas mean:${stSa.mean}; Kekeruhan mean:${stT.mean}.\n` +
          "Tulis satu paragraf 30–40 kata, tanpa tanggal/prefix. Fokus status WQI lalu parameter.";

        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo-0125",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
        });
        content = (completion?.choices?.[0]?.message?.content || "").trim();
        content = clipWords(content, 30, 40);
      } catch (e) {
        console.error("OpenAI error:", e?.message || e);
      }
    }

    // fallback deterministik
    if (!content) {
      content = clipWords(hints, 30, 40);
    }

    const debug = wantDebug
      ? {
        source,
        used_window_days: days,
        date_range: { from: startTs, to: endTs },
        wqi_overall: wqiOverall,
        wqi_stats: stW,
        param_stats: { PH: stP, Suhu: stS, Salinitas: stSa, Kekeruhan: stT },
      }
      : undefined;

    return res.json({
      status: wqiOverall,                // label utama mengikuti WQI
      condition_text: content,          // 30–40 kata, TANPA prefix tanggal
      numbers: {
        forecast_window_days: days,
        date_range: { from: startTs, to: endTs }, // agar FE bisa bikin prefix tanggal sendiri
        wqi: stW,
        minmax_p50: { Suhu: stS, PH: stP, Salinitas: stSa, Kekeruhan: stT },
      },
      used: { from: source, ranges: SAFE_RANGE, meta },
      ...(wantDebug ? { debug } : {}),
    });
  } catch (e) {
    const code = e?.status || 500;
    console.error("aiSummary fatal:", e);
    res.status(code).json({ message: e?.message || "aiSummary failed" });
  }
};

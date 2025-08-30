// ai.controller.js
import dayjs from "dayjs";
import OpenAI from "openai";
import { TB_HistoryPeramalan } from "../models/index.js";

/** <- aman: tidak throw kalau key kosong */
function getMaybeKey() {
  return process.env.OPEN_AI_KEY || process.env.OPENAI_API_KEY || null;
}

const SAFE_RANGE = {
  suhu: { min: 26, max: 34 },
  ph: { min: 7, max: 9 },
  sal: { min: 10, max: 30 },
  turb: { max: 200 }
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function normForecastRow(p) {
  // dukung format dari dummy forecast: {Suhu:{p50,...}, PH:{...}, Salinitas:{...}, Kekeruhan:{...}, risk_label}
  const P = p?.Parameter ?? p ?? {};
  const asNum = (v) => {
    if (v && typeof v === "object") return num(v.p50);
    return num(v);
  };
  const PHx = P?.PH ?? P?.pH ?? P?.ph;
  return {
    ts: p?.ts || P?.ts || P?.Timestamp || P?.time || null,
    Suhu: asNum(P?.Suhu ?? P?.suhu),
    PH: num(PHx && typeof PHx === "object" ? PHx.p50 : PHx),
    Salinitas: asNum(P?.Salinitas ?? P?.salinitas),
    Kekeruhan: asNum(P?.Kekeruhan ?? P?.kekeruhan),
    risk_label: p?.risk_label ?? P?.risk_label ?? null,
  };
}

function stats(arr) {
  const xs = arr.filter((v) => Number.isFinite(v));
  if (!xs.length) return { count: 0, min: null, max: null, mean: null };
  const s = xs.reduce((a, b) => a + b, 0);
  return { count: xs.length, min: Math.min(...xs), max: Math.max(...xs), mean: +(s / xs.length).toFixed(2) };
}

// Ambil input efektif: (tetap)
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
    throw Object.assign(new Error("ID_Tambak is required when sensor/forecast not provided"), { status: 400 });
  }

  const row = await TB_HistoryPeramalan.findOne({
    where: { ID_Tambak: ID_Tambak },
    order: [["createdAt", "DESC"]],
    attributes: ["Data_Parameter", "createdAt"]
  });
  if (!row) {
    throw Object.assign(new Error("No TB_HistoryPeramalan found for this tambak"), { status: 404 });
  }

  const DP = row?.Data_Parameter || {};
  const sl = DP?.sensor_last || DP?.sensor || null;

  const sensorNow = {
    Suhu: num(sl?.Suhu ?? sl?.suhu) ?? 0,
    PH: num(sl?.PH ?? sl?.pH ?? sl?.ph) ?? 0,
    Salinitas: num(sl?.Salinitas ?? sl?.salinitas) ?? 0,
    Kekeruhan: num(sl?.Kekeruhan ?? sl?.kekeruhan) ?? 0,
  };
  const sensorAt = sl?.at || null;
  const fc = Array.isArray(DP?.forecast) ? DP.forecast : [];

  return { sensorNow, sensorAt, forecast: fc, source: "historyperamalan" };
}

function worstStatus(a, b) {
  const rank = { Baik: 0, Waspada: 1, Buruk: 2 };
  return (rank[a] >= rank[b]) ? a : b;
}

// ======== NEW: status dari forecast row (prioritaskan risk_label) ========
function statusFromForecastRow(row) {
  if (row?.risk_label === "Buruk" || row?.risk_label === "Waspada" || row?.risk_label === "Baik") {
    return row.risk_label;
  }
  // fallback ke ambang SAFE_RANGE jika risk_label tak ada
  const bad =
    (row.Suhu < SAFE_RANGE.suhu.min || row.Suhu > SAFE_RANGE.suhu.max) ||
    (row.PH < SAFE_RANGE.ph.min || row.PH > SAFE_RANGE.ph.max) ||
    (row.Salinitas < SAFE_RANGE.sal.min || row.Salinitas > SAFE_RANGE.sal.max) ||
    (row.Kekeruhan > SAFE_RANGE.turb.max);
  const near =
    (row.Suhu >= 26 && row.Suhu < 28) || (row.Suhu > 32 && row.Suhu <= 34) ||
    (row.PH >= 7 && row.PH < 7.5) || (row.PH > 8.5 && row.PH <= 9) ||
    (row.Salinitas >= 10 && row.Salinitas < 15) || (row.Salinitas > 25 && row.Salinitas <= 30) ||
    (row.Kekeruhan > 100 && row.Kekeruhan <= 200);
  if (bad) return "Buruk";
  if (near) return "Waspada";
  return "Baik";
}

// ======== NEW: filter forecast ke depan saja & batasi hari ========
function sliceFutureForecast(fcEff, rangeDays = 7) {
  const now = Date.now();
  const days = Math.max(1, Math.min(30, Number(rangeDays) || 7)); // 1..30
  const until = dayjs(now).add(days, "day");
  const rows = [];
  for (const raw of fcEff) {
    const r = normForecastRow(raw);
    const ms = r.ts ? +new Date(r.ts) : NaN;
    if (!Number.isFinite(ms)) continue;
    if (ms <= now) continue;                 // ← buang masa lalu
    if (dayjs(ms).isAfter(until)) continue;  // ← batasi max N hari
    rows.push(r);
  }
  return { rows, days };
}

export const aiSummary = async (req, res) => {
  try {
    const { sensor, forecast, meta = {}, debug: debugReq, ID_Tambak, range_days, only_forecast } = req.body || {};
    const wantDebug = Boolean(debugReq ?? req.query?.debug);

    const { sensorNow, sensorAt, forecast: fcEff, source } =
      await resolveInputs({ sensor, forecast, ID_Tambak });

    // === gunakan HANYA FORECAST untuk ringkasan ===
    const { rows: fwd, days } = sliceFutureForecast(fcEff, range_days ?? meta?.range?.days ?? 7);

    if (!fwd.length) {
      return res.status(400).json({ message: "Tidak ada data peramalan ke depan dalam jendela yang diminta." });
    }

    // status = agregasi 'terburuk' dalam jendela forecast
    let fcStatus = "Baik";
    for (const r of fwd) {
      fcStatus = worstStatus(fcStatus, statusFromForecastRow(r));
      if (fcStatus === "Buruk") break;
    }
    const finalStatus = fcStatus; // <-- tidak digabung dengan sensor_now

    // statistik MIN–MAX p50 untuk BARIS ANGKA
    const stS = stats(fwd.map(r => r.Suhu));
    const stP = stats(fwd.map(r => r.PH));
    const stSa = stats(fwd.map(r => r.Salinitas));
    const stT = stats(fwd.map(r => r.Kekeruhan));

    const fmt = {
      rng: (s, u = "") => (Number.isFinite(s.min) && Number.isFinite(s.max))
        ? `${s.min.toFixed(u === "NTU" ? 0 : 2)}–${s.max.toFixed(u === "NTU" ? 0 : 2)}${u ? ` ${u}` : ""}`
        : "NA",
    };

    const numbersLine =

      `Suhu ${fmt.rng(stS, "°C")}, pH ${fmt.rng(stP)}, ` +
      `Salinitas ${fmt.rng(stSa, " ppt")}, Kekeruhan ${fmt.rng(stT, "NTU")}.`;

    // coba OpenAI; instruksi: JANGAN sarankan ganti air laut
    const key = (process.env.OPEN_AI_KEY || process.env.OPENAI_API_KEY || null);
    let content = "";
    if (key) {
      try {
        const openai = new OpenAI({ apiKey: key });
        const system = [
          "Kamu asisten kualitas air tambak LAUT (skala besar, sulit mengganti air).",
          "Jawab ringkas, actionable, Bahasa Indonesia,dan mudah dipahami untuk pemula.",
          "Batas acuan: suhu 26–34°C, pH 7–9, salinitas 10–30 ppt, kekeruhan ≤200 NTU.",
          "Output maks 45 kata, SATU paragraf.",
          "Mulai jawaban dengan BARIS ANGKA yang diberikan.",
          "JANGAN menyarankan penggantian air; fokus aerasi/sirkulasi, manajemen pakan, shading, buffering pH/salinitas yang aman."
        ].join(" ");
        const userPrompt = [
          `BARIS PARAMETER: ${numbersLine}`,
          `Status peramalan gabungan: ${finalStatus}.`,
          "Setelah baris angka, beri 1–2 saran praktis yang relevan untuk lingkungan laut (tanpa ganti air).",
          "Jangan lebih dari 45 kata."
        ].join("\n");

        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo-0125",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt }
          ]
        });
        content = completion.choices?.[0]?.message?.content?.trim() || "";
      } catch (e) {
        console.error("OpenAI error:", e?.message || e);
      }
    }

    // fallback deterministik (tanpa OpenAI / gagal)
    const hasNumbers = content && content.includes("Peramalan");
    if (!hasNumbers) {
      const saran =
        finalStatus === "Baik"
          ? "Kondisi cenderung stabil; lanjutkan pemantauan berkala, jaga aerasi dan beban pakan."
          : finalStatus === "Waspada"
            ? "Waspada; optimalkan aerasi/sirkulasi, kurangi pakan sementara, cek pH/salinitas harian."
            : "Risiko tinggi; maksimalkan aerasi, kurangi pakan, gunakan buffering pH/salinitas yang aman.";
      content = `${numbersLine} Status ${finalStatus}. ${saran}`;
    }

    const fcStats = {
      Suhu: stS, PH: stP, Salinitas: stSa, Kekeruhan: stT
    };

    const debug = wantDebug ? {
      source,
      used_window_days: days,
      forecast_len_total: fcEff.length,
      forecast_len_future: fwd.length,
      computed: { finalStatus },
      meta
    } : undefined;

    return res.json({
      status: finalStatus,
      condition_text: content,              // ← dari forecast, bukan sensor_last
      numbers: {
        forecast_window_days: days,
        minmax_p50: fcStats,               // ← MIN–MAX p50 di jendela
      },
      used: { from: source, ranges: SAFE_RANGE, meta },
      ...(wantDebug ? { debug } : {})
    });
  } catch (e) {
    const code = e?.status || 500;
    console.error("aiSummary fatal:", e);
    res.status(code).json({ message: e?.message || "aiSummary failed" });
  }
};
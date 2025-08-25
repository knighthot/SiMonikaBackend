import OpenAI from "openai";

function getServerOpenAIKey() {
  const k = process.env.OPEN_AI_KEY;
  if (!k) {
    const err = new Error("OPEN_AI_KEY is not set on server");
    err.status = 500;
    throw err;
  }
  return k;
}

const SAFE_RANGE = {
  suhu: { min: 26, max: 34 },
  ph:   { min: 7,  max: 9  },
  sal:  { min: 10, max: 30 },
  turb: { max: 200 }
};

const WQI_THRESH = { good: 80, fair: 60 };

// helper angka
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ambil WQI dari berbagai kemungkinan field
const extractWqi = (p) => {
  const src = p?.Parameter ?? p ?? {};
  // kandidat umum
  for (const k of ["WQI","wqi","Wqi","wqi_value","WQI_value"]) {
    const v = num(src?.[k]);
    if (v !== null) return v;
  }
  // nested: { Index: { WQI } }
  const idx = src?.Index ?? src?.index;
  const v2 = num(idx?.WQI ?? idx?.wqi);
  return v2 ?? NaN;
};

const wqiToStatusText = (wqi) =>
  wqi >= WQI_THRESH.good ? "Baik" : wqi >= WQI_THRESH.fair ? "Waspada" : "Buruk";

function statusFromPoint({ Suhu, PH, Salinitas, Kekeruhan }) {
  const bad =
    (Suhu < SAFE_RANGE.suhu.min || Suhu > SAFE_RANGE.suhu.max) ||
    (PH < SAFE_RANGE.ph.min   || PH   > SAFE_RANGE.ph.max)   ||
    (Salinitas < SAFE_RANGE.sal.min || Salinitas > SAFE_RANGE.sal.max) ||
    (Kekeruhan > SAFE_RANGE.turb.max);
  const warn =
    (Suhu >= 26 && Suhu < 28) || (Suhu > 32 && Suhu <= 34) ||
    (PH >= 7 && PH < 7.5) || (PH > 8.5 && PH <= 9) ||
    (Salinitas >= 10 && Salinitas < 15) || (Salinitas > 25 && Salinitas <= 30) ||
    (Kekeruhan > 100 && Kekeruhan <= 200);

  if (bad) return "Buruk";
  if (warn) return "Waspada";
  return "Baik";
}

function worstStatus(a, b) {
  const rank = { Baik: 0, Waspada: 1, Buruk: 2 };
  return (rank[a] >= rank[b]) ? a : b;
}

function norm(p) {
  const P = p?.Parameter ?? p ?? {};
  const PH = P?.PH ?? P?.pH ?? P?.ph;
  return {
    Suhu: num(P?.Suhu ?? P?.suhu) ?? 0,
    PH: num(PH) ?? 0,
    Salinitas: num(P?.Salinitas ?? P?.salinitas) ?? 0,
    Kekeruhan: num(P?.Kekeruhan ?? P?.kekeruhan) ?? 0,
  };
}

function stats(arr) {
  if (!arr.length) return { count: 0, min: null, max: null, mean: null };
  let s = 0, min = +Infinity, max = -Infinity;
  for (const v of arr) { s += v; if (v < min) min = v; if (v > max) max = v; }
  return { count: arr.length, min, max, mean: +(s/arr.length).toFixed(2) };
}

export const aiSummary = async (req, res, next) => {
  try {
    const { sensor, forecast = [], meta = {}, debug: debugReq } = req.body || {};
    const wantDebug = Boolean(debugReq ?? req.query?.debug); // <- aktifkan debug via body.debug atau ?debug=1
    if (!sensor) return res.status(400).json({ message: "sensor is required" });

    const sensorNow = {
      Suhu: num(sensor.Suhu ?? sensor.suhu) ?? 0,
      PH: num(sensor.PH ?? sensor.pH ?? sensor.ph) ?? 0,
      Salinitas: num(sensor.Salinitas ?? sensor.salinitas) ?? 0,
      Kekeruhan: num(sensor.Kekeruhan ?? sensor.kekeruhan) ?? 0,
    };
    const nowStatus = statusFromPoint(sensorNow);

    // --- PRIORITAS WQI FORECAST ---
    let fcStatus = "Baik";
    const wqis = forecast.map(extractWqi).filter(Number.isFinite);
    const usedWqi = wqis.length > 0;
    if (usedWqi) {
      const minWqi = Math.min(...wqis);
      fcStatus = wqiToStatusText(minWqi);
    } else {
      for (const raw of forecast) {
        const s = statusFromPoint(norm(raw));
        fcStatus = worstStatus(fcStatus, s);
        if (fcStatus === "Buruk") break;
      }
    }

    const finalStatus = worstStatus(nowStatus, fcStatus);

    // --- Prompt OpenAI ringkas ---
    const system = [
      "Kamu asisten kualitas air tambak laut untuk Kerapu Cantang.",
      "Jawab sangat ringkas, actionable, dan berbahasa Indonesia.",
      "Gunakan batas: suhu 26–34°C, pH 7–9, salinitas 10–30 ppt, kekeruhan ≤200 NTU.",
      "Output HARUS 1 paragraf saja, tanpa bullet/heading, total 30–40 kata MAKSIMAL.",
      "jangan sebut forecast tapi sebut peramalan"
    ].join(" ");

    const userPrompt = [
      `DATA: Suhu=${sensorNow.Suhu}°C, pH=${sensorNow.PH}, Salinitas=${sensorNow.Salinitas} ppt, Kekeruhan=${sensorNow.Kekeruhan} NTU.`,
      `peramalan: ${forecast?.length ? `${forecast.length} titik ke depan (gunakan jika perlu).` : "tidak ada."}`,
      `Status sistem (gabungan sensor+): ${finalStatus}.`,
      "",
      "TULIS:",
      "- Ringkas kondisi inti + 1–2 saran praktis + antisipasi singkat jika ada indikasi perubahan dari peramalan.",
      "- Maksimal 35 kata total. Jangan pakai list. Satu paragraf.",
    ].join("\n");

    const openai = new OpenAI({ apiKey: getServerOpenAIKey() });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ]
    });

    const content = completion.choices?.[0]?.message?.content?.trim() || "";

    // --- DEBUG payload biar “kelihatan parameternya” ---
    const debug = wantDebug ? {
      safe_range: SAFE_RANGE,
      wqi_thresholds: WQI_THRESH,
      input: {
        sensor_now: sensorNow,
        forecast_len: forecast?.length ?? 0,
      },
      computed: {
        nowStatus,
        fcStatus,
        finalStatus,
        usedWqi,
        wqi_stats: stats(wqis),
      },
      samples: {
        first3: (forecast || []).slice(0,3).map((it, i) => {
          const n = norm(it);
          return {
            idx: i,
            WQI: extractWqi(it) ?? null,
            Suhu: n.Suhu, PH: n.PH, Salinitas: n.Salinitas, Kekeruhan: n.Kekeruhan,
            raw_time: it?.Time || it?.time || it?.timestamp || null,
          };
        })
      },
      meta
    } : undefined;

    return res.json({
      status: finalStatus,
      condition_text: content,
      used: { ranges: SAFE_RANGE, meta },
      ...(wantDebug ? { debug } : {})
    });
  } catch (e) { next(e); }
};

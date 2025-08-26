// utils/wqi.js

export const SAFE_RANGE = {
  suhu: { min: 26, max: 34 },
  ph:   { min: 7,  max: 9  },
  sal:  { min: 10, max: 30 },
  turb: { max: 200 }
};

export const WQI_THRESH = { good: 80, fair: 60 };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function extractWqi(p) {
  const src = p?.Parameter ?? p ?? {};
  for (const k of ["WQI","wqi","Wqi","wqi_value","WQI_value"]) {
    const v = num(src?.[k]);
    if (v !== null) return v;
  }
  const idx = src?.Index ?? src?.index;
  const v2 = num(idx?.WQI ?? idx?.wqi);
  return v2 ?? NaN;
}

export function wqiToStatusText(wqi) {
  return wqi >= WQI_THRESH.good ? "Baik"
       : wqi >= WQI_THRESH.fair ? "Waspada"
       : "Buruk";
}

export function riskFromPoint({ Suhu, PH, Salinitas, Kekeruhan }) {
  const s  = Number(Suhu), pH = Number(PH), sa = Number(Salinitas), ku = Number(Kekeruhan);

  const bad =
    (Number.isFinite(s)  && (s < SAFE_RANGE.suhu.min || s > SAFE_RANGE.suhu.max)) ||
    (Number.isFinite(pH) && (pH < SAFE_RANGE.ph.min   || pH > SAFE_RANGE.ph.max)) ||
    (Number.isFinite(sa) && (sa < SAFE_RANGE.sal.min  || sa > SAFE_RANGE.sal.max)) ||
    (Number.isFinite(ku) && (ku > SAFE_RANGE.turb.max));

  const warn =
    (Number.isFinite(s)  && ((s >= 26 && s < 28) || (s > 32 && s <= 34))) ||
    (Number.isFinite(pH) && ((pH >= 7 && pH < 7.5) || (pH > 8.5 && pH <= 9))) ||
    (Number.isFinite(sa) && ((sa >= 10 && sa < 15) || (sa > 25 && sa <= 30))) ||
    (Number.isFinite(ku) && (ku > 100 && ku <= 200));

  if (bad)  return { idx: 0.80, label: "Buruk" };
  if (warn) return { idx: 0.50, label: "Waspada" };
  return { idx: 0.15, label: "Baik" };
}

export function statusFromPoint(p) {
  return riskFromPoint(p).label;
}

export function worstStatus(a, b) {
  const rank = { Baik: 0, Waspada: 1, Buruk: 2 };
  return (rank[a] >= rank[b]) ? a : b;
}

// (opsional) buat statistik array angka
export function stats(arr = []) {
  if (!arr.length) return { count: 0, min: null, max: null, mean: null };
  let s = 0, min = +Infinity, max = -Infinity;
  for (const v of arr) { s += v; if (v < min) min = v; if (v > max) max = v; }
  return { count: arr.length, min, max, mean: +(s/arr.length).toFixed(2) };
}

// === NEW: hitung WQI sederhana dari parameter ===
export function computeWqiFromParams({ Suhu, PH, Salinitas, Kekeruhan }) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Suhu: penalti 8 poin per 1°C di luar rentang
  let sScore = 100;
  if (Suhu < SAFE_RANGE.suhu.min) sScore = 100 - (SAFE_RANGE.suhu.min - Suhu) * 8;
  else if (Suhu > SAFE_RANGE.suhu.max) sScore = 100 - (Suhu - SAFE_RANGE.suhu.max) * 8;
  sScore = clamp(sScore, 0, 100);

  // pH: penalti 80 poin per 1 unit pH di luar rentang
  let pScore = 100;
  if (PH < SAFE_RANGE.ph.min) pScore = 100 - (SAFE_RANGE.ph.min - PH) * 80;
  else if (PH > SAFE_RANGE.ph.max) pScore = 100 - (PH - SAFE_RANGE.ph.max) * 80;
  pScore = clamp(pScore, 0, 100);

  // Salinitas: penalti 4 poin per 1 ppt di luar rentang
  let salScore = 100;
  if (Salinitas < SAFE_RANGE.sal.min) salScore = 100 - (SAFE_RANGE.sal.min - Salinitas) * 4;
  else if (Salinitas > SAFE_RANGE.sal.max) salScore = 100 - (Salinitas - SAFE_RANGE.sal.max) * 4;
  salScore = clamp(salScore, 0, 100);

  // Kekeruhan: 0..200 → 100..80; >200 turun linier ke 0 di 400
  let tScore = 100;
  if (Kekeruhan <= SAFE_RANGE.turb.max) {
    tScore = 100 - (Kekeruhan / SAFE_RANGE.turb.max) * 20; // 200 → 80
  } else {
    tScore = 80 - ((Kekeruhan - SAFE_RANGE.turb.max) / SAFE_RANGE.turb.max) * 80; // 400 → 0
  }
  tScore = clamp(tScore, 0, 100);

  // rata-rata sederhana (bisa diberi bobot jika perlu)
  const wqi = (sScore + pScore + salScore + tScore) / 4;
  return Math.round(wqi);
}

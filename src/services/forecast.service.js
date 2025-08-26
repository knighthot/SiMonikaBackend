// services/forecast.service.js
import dayjs from "dayjs";
import { Op } from "sequelize";
import { TB_History } from "../models/index.js";

/** Ambang batas sederhana untuk label risiko */
const SAFE = {
  suhu: { min: 26, max: 34 },
  ph:   { min: 7,  max: 9  },
  sal:  { min: 10, max: 30 },
  turb: { max: 200 },
};

/** Util angka */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Label risiko dari satu titik */
function riskFromPoint({ Suhu, PH, Salinitas, Kekeruhan }) {
  const out =
    (Suhu < SAFE.suhu.min || Suhu > SAFE.suhu.max) ||
    (PH   < SAFE.ph.min   || PH   > SAFE.ph.max)   ||
    (Salinitas < SAFE.sal.min || Salinitas > SAFE.sal.max) ||
    (Kekeruhan > SAFE.turb.max);

  const near =
    (Suhu >= 26 && Suhu < 28) || (Suhu > 32 && Suhu <= 34) ||
    (PH >= 7 && PH < 7.5) || (PH > 8.5 && PH <= 9) ||
    (Salinitas >= 10 && Salinitas < 15) || (Salinitas > 25 && Salinitas <= 30) ||
    (Kekeruhan > 100 && Kekeruhan <= 200);

  if (out)  return { risk_index: 0.5, risk_label: "Waspada" };
  if (near) return { risk_index: 0.5, risk_label: "Waspada" };
  return { risk_index: 0.15, risk_label: "Baik" };
}

/** Ambil slice riwayat 1 jam terakhir (berpatokan ke waktu paling baru) */
async function getLastHourRows(ID_Tambak) {
  // waktu paling akhir di history untuk tambak ini
  const lastTs = await TB_History.max("Waktu_History", { where: { ID_Tambak } });
  if (!lastTs) return { rows: [], last: null, from: null, to: null };

  const to = new Date(lastTs);
  const from = dayjs(to).subtract(1, "hour").toDate();

  const rows = await TB_History.findAll({
    where: {
      ID_Tambak: ID_Tambak,
      Waktu_History: { [Op.between]: [from, to] },
    },
    order: [["Waktu_History", "ASC"]],
    attributes: ["pH", "suhu", "kekeruhan", "salinitas", "Waktu_History"],
  });

  const last = rows.length ? rows[rows.length - 1] : null;
  return { rows, last, from, to };
}

/** Hitung rata-rata 1 jam terakhir → seed_base
 *  Fallback ke nilai default bila kosong.
 */
function computeSeedBase(rows) {
  if (!rows.length) {
    return { Suhu: 28.4, PH: 7.8, Salinitas: 28.06, Kekeruhan: 41.02 };
  }
  let s = 0, p = 0, sa = 0, t = 0, n = 0;
  for (const r of rows) {
    const Suhu = num(r?.suhu), PH = num(r?.pH), Sal = num(r?.salinitas), Turb = num(r?.kekeruhan);
    // anggap semua ada → kalau ada null tetap dihitung yang ada
    if (Suhu !== null || PH !== null || Sal !== null || Turb !== null) {
      s += Suhu ?? 0; p += PH ?? 0; sa += Sal ?? 0; t += Turb ?? 0; n += 1;
    }
  }
  if (!n) return { Suhu: 28.4, PH: 7.8, Salinitas: 28.06, Kekeruhan: 41.02 };
  return {
    Suhu: +(s / n).toFixed(2),
    PH: +(p / n).toFixed(2),
    Salinitas: +(sa / n).toFixed(2),
    Kekeruhan: +(t / n).toFixed(2),
  };
}

/** Noise kecil untuk dummy forecast (bukan model ML) */
function jitter(x, amt) {
  // amt = besaran deviasi maksimum (mis. 0.4)
  const delta = (Math.random() * 2 - 1) * amt;
  return +(x + delta).toFixed(2);
}

/** Bangun satu titik forecast dengan p50/p90 */
function buildPoint(ts, base, stepIdx) {
  // sedikit tren sinus + jitter, tetap dijaga batas fisik wajar
  const phase = Math.sin((stepIdx % 24) / 24 * Math.PI * 2);

  const p50 = {
    Suhu:      clamp(jitter(base.Suhu      + phase * 0.3, 0.4), 20, 40),
    PH:        clamp(jitter(base.PH        + phase * 0.05, 0.08), 6.0, 9.5),
    Salinitas: clamp(jitter(base.Salinitas + phase * 0.6, 1.0),  0,  40),
    Kekeruhan: clamp(Math.round(jitter(base.Kekeruhan + phase * 5, 10)), 0, 300),
  };

  const spread = {
    Suhu: 0.6, PH: 0.15, Salinitas: 2.5, Kekeruhan: 40,
  };

  const mkBand = (val, w) => ({
    p50: val,
    p90_low: +(val - w).toFixed(2),
    p90_high: +(val + w).toFixed(2),
  });

  const { risk_index, risk_label } = riskFromPoint({
    Suhu: p50.Suhu, PH: p50.PH, Salinitas: p50.Salinitas, Kekeruhan: p50.Kekeruhan,
  });

  return {
    ts: ts.toISOString(),
    Suhu:      mkBand(p50.Suhu,      spread.Suhu),
    PH:        mkBand(p50.PH,        spread.PH),
    Salinitas: mkBand(p50.Salinitas, spread.Salinitas),
    Kekeruhan: mkBand(p50.Kekeruhan, spread.Kekeruhan),
    risk_index, risk_label,
  };
}

/** API utama: bikin dummy forecast berbasis 1 jam riwayat terbaru */
export async function doForecast({
  id_tambak,
  id_perangkat_iot = null,
  horizon = 168,
  frequency = "hourly",
  history_range = null,
} = {}) {
  if (!id_tambak) {
    throw Object.assign(new Error("id_tambak is required"), { status: 400 });
  }

  // clamp horizon: max 30 hari (720 jam)
  let H = Math.max(1, Math.min(Number(horizon || 24), 720));

  const { rows, last, to } = await getLastHourRows(id_tambak);

  const seed_base = computeSeedBase(rows);

  const sensor_last = last ? {
    Suhu: num(last?.suhu),
    PH: num(last?.pH),
    Salinitas: num(last?.salinitas),
    Kekeruhan: num(last?.kekeruhan),
    at: last?.Waktu_History ? new Date(last.Waktu_History).toISOString() : null,
  } : null;

  const issuedAt = new Date();
  const lastTs = to ? new Date(to) : issuedAt;

  // start basis = waktu yang lebih besar antara lastTs dan "sekarang"
  // → tidak akan pernah membuat titik yang berada di masa lalu
const startBaseMs = Math.max(lastTs.getTime(), Date.now());
const startBase   = dayjs(startBaseMs);


const forecast = [];
for (let i = 1; i <= H; i++) {
  const ts = startBase.add(i, "hour").toDate();
  forecast.push(buildPoint(ts, seed_base, i));
}


  return {
    meta: {
      model: "tft",
      version: "1.0.0",
      frequency,
      horizon: H,
      issued_at: issuedAt.toISOString(),
      window: null,
      input: {
        id_tambak,
        id_perangkat_iot,
        variables: ["Suhu", "PH", "Salinitas", "Kekeruhan"],
        history_range,
      },
      metrics: { mae: null, rmse: null },
      notes: "Dummy forecast — bukan hasil model",
    },
    seed_base,
    sensor_last,
    summary_input_sensor: sensor_last ?? seed_base,
    forecast,
  };
}

export default { doForecast };

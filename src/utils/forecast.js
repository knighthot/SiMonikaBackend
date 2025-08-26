// utils/forecast.js
import dayjs from "dayjs";
import { riskFromPoint } from "./wqi.js";

export const jitter = (base, amp = 0.5, digits = 2) =>
  Number((base + (Math.random() * 2 - 1) * amp).toFixed(digits));

export function generateDummyForecast({
  id_tambak = null,
  id_perangkat_iot = null,
  horizon = 24,
  frequency = "hourly",
  history_range = null,
  window_start = null,
  window_end = null,
  base = {}            // <<=== NEW: seed dari history 1 jam (mean)
}) {
  const step = frequency === "daily" ? { unit: "day", n: 1 } : { unit: "hour", n: 1 };

  let startTs = window_start ? dayjs(window_start) : dayjs().add(1, step.unit);
  let endTs   = window_end ? dayjs(window_end)   : null;

  let H = Number(horizon || 24);
  if (window_start && window_end) {
    const diff = endTs.diff(startTs, step.unit === "hour" ? "hour" : "day");
    H = Math.max(1, diff);
  }

  const b = {
    Suhu:      Number.isFinite(+base.Suhu)      ? +base.Suhu      : 29.0,
    PH:        Number.isFinite(+base.PH)        ? +base.PH        : 7.8,
    Salinitas: Number.isFinite(+base.Salinitas) ? +base.Salinitas : 22.0,
    Kekeruhan: Number.isFinite(+base.Kekeruhan) ? +base.Kekeruhan : 80,
  };

  const rows = [];
  for (let i = 0; i < H; i++) {
    const ts = startTs.add(i * step.n, step.unit).toISOString();

    const Suhu_p50      = jitter(b.Suhu, 0.7);
    const PH_p50        = jitter(b.PH, 0.25);
    const Salinitas_p50 = jitter(b.Salinitas, 2.5);
    const Kekeruhan_p50 = Math.max(30, Math.round(jitter(b.Kekeruhan, 30, 0)));

    const { idx, label } = riskFromPoint({
      Suhu: Suhu_p50, PH: PH_p50, Salinitas: Salinitas_p50, Kekeruhan: Kekeruhan_p50
    });

    rows.push({
      ts,
      Suhu:      { p50: Suhu_p50,      p90_low: +(Suhu_p50 - 0.8).toFixed(2),  p90_high: +(Suhu_p50 + 0.8).toFixed(2) },
      PH:        { p50: PH_p50,        p90_low: +(PH_p50 - 0.3).toFixed(2),    p90_high: +(PH_p50 + 0.3).toFixed(2)   },
      Salinitas: { p50: Salinitas_p50, p90_low: +(Salinitas_p50 - 3).toFixed(2), p90_high: +(Salinitas_p50 + 3).toFixed(2) },
      Kekeruhan: { p50: Kekeruhan_p50, p90_low: Math.max(0, Kekeruhan_p50 - 40), p90_high: Kekeruhan_p50 + 40 },
      risk_index: +idx.toFixed(2),
      risk_label: label,
    });
  }

  return {
    meta: {
      model: "tft",
      version: "1.0.0",
      frequency,
      horizon: H,
      issued_at: new Date().toISOString(),
      window: window_start && window_end ? { start: startTs.toISOString(), end: endTs.toISOString() } : null,
      input: {
        id_tambak,
        id_perangkat_iot,
        variables: ["Suhu","PH","Salinitas","Kekeruhan"],
        history_range: history_range || null
      },
      metrics: { mae: null, rmse: null },
      notes: "Dummy forecast — bukan hasil model"
    },
    forecast: rows
  };
}

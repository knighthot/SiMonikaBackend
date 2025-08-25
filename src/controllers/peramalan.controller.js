import dayjs from "dayjs";

// helper label risiko (sama logika dgn dashboardmu)
function riskFromPoint({ Suhu, PH, Salinitas, Kekeruhan }) {
  const bad =
    (Suhu < 26 || Suhu > 34) ||
    (PH < 7 || PH > 9) ||
    (Salinitas < 10 || Salinitas > 30) ||
    (Kekeruhan > 200);
  const warn =
    (Suhu >= 26 && Suhu < 28) || (Suhu > 32 && Suhu <= 34) ||
    (PH >= 7 && PH < 7.5) || (PH > 8.5 && PH <= 9) ||
    (Salinitas >= 10 && Salinitas < 15) || (Salinitas > 25 && Salinitas <= 30) ||
    (Kekeruhan > 100 && Kekeruhan <= 200);

  if (bad) return { idx: 0.8, label: "Buruk" };
  if (warn) return { idx: 0.5, label: "Waspada" };
  return { idx: 0.15, label: "Baik" };
}

// generator angka dummy realistis
function jitter(base, amp = 0.5) {
  return +(base + (Math.random() * 2 - 1) * amp).toFixed(2);
}

export const forecastDummy = async (req, res, next) => {
  try {
    const {
      id_tambak = null,
      id_perangkat_iot = null,
      horizon = 24,
      frequency = "hourly",
      history_range = null
    } = req.body || {};

    const step = frequency === "daily" ? { unit: "day", n: 1 } : { unit: "hour", n: 1 };
    const startTs = dayjs().add(1, step.unit); // mulai dari periode berikutnya
    const rows = [];

    // baseline “musiman” sederhana (dummy)
    for (let i = 0; i < Number(horizon || 24); i++) {
      const ts = startTs.add(i * step.n, step.unit).toISOString();

      // contoh baseline
      const Suhu_p50      = jitter(29.0, 0.7);
      const PH_p50        = jitter(7.8, 0.25);
      const Salinitas_p50 = jitter(22.0, 2.5);
      const Kekeruhan_p50 = Math.max(30, Math.round(80 + (Math.random() * 60 - 30)));

      const point = { Suhu: Suhu_p50, PH: PH_p50, Salinitas: Salinitas_p50, Kekeruhan: Kekeruhan_p50 };
      const { idx, label } = riskFromPoint(point);

      rows.push({
        ts,
        Suhu:      { p50: Suhu_p50,      p90_low: +(Suhu_p50 - 0.8).toFixed(2),  p90_high: +(Suhu_p50 + 0.8).toFixed(2) },
        PH:        { p50: PH_p50,        p90_low: +(PH_p50 - 0.3).toFixed(2),    p90_high: +(PH_p50 + 0.3).toFixed(2)   },
        Salinitas: { p50: Salinitas_p50, p90_low: +(Salinitas_p50 - 3).toFixed(2), p90_high: +(Salinitas_p50 + 3).toFixed(2) },
        Kekeruhan: { p50: Kekeruhan_p50, p90_low: Math.max(0, Kekeruhan_p50 - 40), p90_high: Kekeruhan_p50 + 40 },
        risk_index: +idx.toFixed(2),
        risk_label: label
      });
    }

    const payload = {
      meta: {
        model: "tft",
        version: "1.0.0",
        frequency,
        horizon: Number(horizon || 24),
        issued_at: new Date().toISOString(),
        input: {
          id_tambak,
          id_perangkat_iot,
          variables: ["Suhu", "PH", "Salinitas", "Kekeruhan"],
          history_range: history_range || null
        },
        metrics: { mae: null, rmse: null },
        notes: "Dummy forecast — bukan hasil model"
      },
      forecast: rows
    };

    res.json(payload);
  } catch (e) {
    next(e);
  }
};

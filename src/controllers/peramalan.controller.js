import dayjs from "dayjs";
import { Op } from "sequelize";
import { doForecast } from "../services/forecast.service.js";
import { TB_AutoForecast, TB_HistoryPeramalan } from "../models/index.js";

function ceilToNextHour(d=new Date()) {
  const x = new Date(d);
  x.setMinutes(0,0,0);
  x.setHours(x.getHours()+1);
  return x;
}

export const forecast = async (req, res) => {
  try {
    const { id_tambak, id_perangkat_iot, horizon, frequency, history_range } = req.body || {};
    const payload = await doForecast({ id_tambak, id_perangkat_iot, horizon, frequency, history_range });

    // simpan ke TB_HistoryPeramalan
    await TB_HistoryPeramalan.create({
      ID_Tambak: id_tambak,
      ID_PerangkatIot: id_perangkat_iot || null,
      Tanggal_Awal: new Date().toISOString().slice(0,10),
      Tanggal_Akhir: new Date(Date.now() + payload.meta.horizon*3600*1000).toISOString().slice(0,10),
      Jumlah_Hari: Math.ceil(payload.meta.horizon/24),
      Data_Parameter: {
        sensor_last: payload.sensor_last,
        forecast: payload.forecast
      },
      Payload: payload,
      IssuedAt: payload.meta.issued_at,
      Horizon: payload.meta.horizon,
      Frequency: payload.meta.frequency,
      WindowStart: null,
      WindowEnd: null,
    });

    res.json(payload);
  } catch (e) {
    const code = e?.status || 500;
    res.status(code).json({ message: e?.message || "forecast failed" });
  }
};

export const autoStart = async (req, res, next) => {
  try {
    const { id_tambak, id_perangkat_iot, window_start, window_end, frequency="hourly", horizon=168 } = req.body || {};
    if (!id_tambak || !id_perangkat_iot) return res.status(400).json({ message: "id_tambak & id_perangkat_iot required" });

    const [row, created] = await TB_AutoForecast.findOrCreate({
      where: { ID_Tambak: id_tambak, ID_PerangkatIot: id_perangkat_iot },
      defaults: {
        WindowStart: new Date(window_start || new Date()),
        WindowEnd:   new Date(window_end   || new Date(Date.now() + 7*864e5)),
        Frequency: frequency,
        Horizon: horizon,
        Active: true,
        NextDueAt: ceilToNextHour(), // mulai jam depan
      }
    });

    if (!created) {
      // update konfigurasi + aktifkan
      row.WindowStart = new Date(window_start || row.WindowStart);
      row.WindowEnd   = new Date(window_end   || row.WindowEnd);
      row.Frequency   = frequency;
      row.Horizon     = horizon;
      row.Active      = true;

      // cooldown kecil agar tidak flood start berulang
      const now = new Date();
      const minNext = new Date((row.LastRunAt || 0));
      minNext.setMinutes(minNext.getMinutes() + (row.CooldownMin || 5));
      row.NextDueAt = now < minNext ? minNext : ceilToNextHour(now);
      await row.save();
      return res.json({ ok: true, updated: true, next_due_at: row.NextDueAt });
    }

    res.json({ ok: true, created: true, next_due_at: row.NextDueAt });
  } catch (e) { next(e); }
};

export const autoStop = async (req, res, next) => {
  try {
    const { id_tambak, id_perangkat_iot } = req.body || {};
    if (!id_tambak || !id_perangkat_iot) return res.status(400).json({ message: "id_tambak & id_perangkat_iot required" });

    const row = await TB_AutoForecast.findOne({ where: { ID_Tambak: id_tambak, ID_PerangkatIot: id_perangkat_iot } });
    if (!row) return res.status(404).json({ message: "not found" });
    row.Active = false;
    await row.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export async function autoForecastTick(req, res, next) {
  const run = async () => {
    const now = new Date();

    // ambil semua job yang aktif & jatuh tempo
    const jobs = await TB_AutoForecast.findAll({
      where: {
        Active: true,
        NextDueAt: { [Op.lte]: now },
      },
    });

    let ran = 0;
    for (const job of jobs) {
      try {
        // 1) generate forecast
        const payload = await doForecast({
          id_tambak: job.ID_Tambak,
          id_perangkat_iot: job.ID_PerangkatIot,
          horizon: job.Horizon || 168,
          frequency: job.Frequency || "hourly",
          history_range: null,
        });

        // 2) simpan ke TB_HistoryPeramalan (field menyesuaikan skema-mu)
        const start = job.WindowStart || now;
        const end   = job.WindowEnd   || dayjs(now).add(7, "day").toDate();
        const days  = Math.max(1, Math.ceil(dayjs(end).diff(dayjs(start), "day", true)));

        await TB_HistoryPeramalan.create({
          ID_Tambak: job.ID_Tambak,
          ID_PerangkatIot: job.ID_PerangkatIot,
          Tanggal_Awal: dayjs(start).format("YYYY-MM-DD"),
          Tanggal_Akhir: dayjs(end).format("YYYY-MM-DD"),
          Jumlah_Hari: days,
          Payload: payload,
          IssuedAt: payload?.meta?.issued_at,
          Horizon: payload?.meta?.horizon,
          Frequency: payload?.meta?.frequency,
          WindowStart: start,
          WindowEnd: end,
        });

        // 3) update jadwal berikutnya (tiap jam)
        job.LastRunAt = now;
        job.NextDueAt = dayjs(now).add(1, "hour").startOf("hour").toDate();
        await job.save();

        ran++;
      } catch (err) {
        // tandai error & tetap jadwalkan 1 jam lagi
        job.FailCount = (job.FailCount || 0) + 1;
        job.LastError = String(err?.message || err);
        job.NextDueAt = dayjs().add(1, "hour").startOf("hour").toDate();
        await job.save();
        console.error("autoForecastTick job error:", err);
      }
    }

    return { now, due: jobs.length, ran };
  };

  // Bisa dipanggil sebagai handler express ATAU langsung dari worker
  if (res && typeof res.json === "function") {
    try {
      const out = await run();
      res.json({ ok: true, ...out });
    } catch (e) { next?.(e); }
  } else {
    return run();
  }
}

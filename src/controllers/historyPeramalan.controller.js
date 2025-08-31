import { TB_HistoryPeramalan, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";
import { Op } from "sequelize";

const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
// ambil key tanpa peduli huruf besar/kecil
const getCI = (obj, ...names) => {
  if (!obj) return undefined;
  const map = {};
  for (const k of Object.keys(obj)) map[k.toLowerCase()] = obj[k];
  for (const name of names) {
    const v = map[String(name).toLowerCase()];
    if (v !== undefined) return v;
  }
  return undefined;
};

export const list = async (req, res, next) => {
  try {
    const mode = (req.query.mode || '').toLowerCase();

    if (mode === 'table') {
      // ====== TABLE MODE ======
      const { ID_Tambak, from, to } = req.query;
      const gap = Math.max(1, parseInt(req.query.gap || '1', 10));

      const where = {};
      if (ID_Tambak) where.ID_Tambak = ID_Tambak;
      if (from && to) where.createdAt = { [Op.between]: [new Date(from), new Date(to)] };

      const list = await TB_HistoryPeramalan.findAll({
        where,
        order: [['createdAt', 'ASC']],
        attributes: ['ID_HistoryPeramalan', 'ID_Tambak', 'createdAt', 'Data_Parameter', 'Data_WQI', 'Waktu_Hit_API'],
      });

      const rows = [];
      for (let i = 0; i < list.length; i += gap) {
        const it = list[i];
        const dp = it?.Data_Parameter;
        const first = Array.isArray(dp) ? dp[0] : dp; // ambil hari pertama bila array
        rows.push({
          tanggal: first?.tanggal || it?.Waktu_Hit_API || it?.createdAt,
          pH: numOrNull(first?.ph),
          suhu: numOrNull(first?.suhu),
          kekeruhan: numOrNull(first?.kekeruhan),
          salinitas: numOrNull(first?.salinitas),
          wqi: numOrNull(getCI(it?.Data_WQI, 'wqi')),
        });
      }

      return res.json({ rows, count: rows.length });
    }

    // ====== DEFAULT MODE (paging bawaan) ======
    const { page, limit, offset } = buildPaging(req.query);
    const where = {};
    if (req.query.ID_Tambak) where.ID_Tambak = req.query.ID_Tambak;

    const result = await TB_HistoryPeramalan.findAndCountAll({
      where,
      offset, limit,
      order: [['createdAt', 'DESC']],
      include: [{ model: TB_Tambak, attributes: ['ID_Tambak', 'Nama'] }]
    });

    return res.json(wrapPaging(result, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_HistoryPeramalan.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (e) { next(e); }
};

// historyPeramalan.controller.js -> create()
export const create = async (req, res, next) => {
  try {
    const b = req.body || {};
    // 1) wajibkan Data_Parameter array harian
    if (!Array.isArray(b.Data_Parameter) || b.Data_Parameter.length === 0) {
      return res.status(400).json({ message: "Data_Parameter (array) wajib diisi" });
    }
    // 2) optional: idempotency/dedupe berdasarkan rentang & device
    const where = {
      ID_Tambak: b.ID_Tambak,
      ID_PerangkatIot: b.ID_PerangkatIot ?? null,
      Tanggal_Awal: b.Tanggal_Awal,
      Tanggal_Akhir: b.Tanggal_Akhir,
      Horizon: b.Horizon ?? null,
      Frequency: b.Frequency ?? null,
    };
    const [row, created] = await TB_HistoryPeramalan.findOrCreate({
      where,
      defaults: {
        ...b,
        Waktu_Hit_API: b.Waktu_Hit_API ? new Date(b.Waktu_Hit_API) : new Date(),
      }
    });
    if (!created) {
      await row.update({ ...b }); // atau skip update jika ingin benar2 idempoten
      return res.json({ ok: true, updated: true, id: row.ID_HistoryPeramalan });
    }
    res.status(201).json({ ok: true, created: true, id: row.ID_HistoryPeramalan });
  } catch (e) { next(e); }
};


export const update = async (req, res, next) => {
  try {
    const data = await TB_HistoryPeramalan.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    await data.update(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    const n = await TB_HistoryPeramalan.destroy({ where: { ID_HistoryPeramalan: req.params.id } });
    if (!n) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export async function getLatestHistory(req, res, next) {
  try {
    const { id_tambak, id_perangkat_iot } = req.query || {};
    if (!id_tambak) return res.status(400).json({ message: "id_tambak required" });

    const where = { ID_Tambak: id_tambak };
    if (id_perangkat_iot) where.ID_PerangkatIot = id_perangkat_iot;

    const row = await TB_HistoryPeramalan.findOne({
      where,
      order: [
        ["Waktu_Hit_API", "DESC"],   // pakai kolom waktu hit api terbaru kalau ada
        ["createdAt", "DESC"],
      ],
      // kalau kamu pakai JSONB di Postgres, tak perlu attributes khusus
    });

    if (!row) return res.json({ data: [] });

    let payload = row.Data_Parameter; // bisa Array / JSON / TEXT
    // kalau kolom disimpan TEXT, parse dulu
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = []; }
    }
    // amankan: pastikan array of object {tanggal, ph, suhu, salinitas, kekeruhan, wqi}
    const arr = Array.isArray(payload) ? payload : [];

    // normalisasi kunci agar lower-case semua
    const norm = arr.map(it => ({
      tanggal: it.tanggal ?? it.date ?? it.day ?? it.ts?.slice?.(0, 10) ?? null,
      ph: it.ph ?? it.pH ?? it.PH ?? null,
      suhu: it.suhu ?? it.Suhu ?? it.temperature ?? null,
      salinitas: it.salinitas ?? it.Salinitas ?? it.salinity ?? null,
      kekeruhan: it.kekeruhan ?? it.Kekeruhan ?? it.turbidity ?? null,
      wqi: it.wqi ?? it.WQI ?? null,
    })).filter(x => x.tanggal);

    return res.json({ data: norm });
  } catch (e) {
    next(e);
  }
}
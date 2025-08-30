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
        attributes: ['ID_HistoryPeramalan', 'ID_Tambak', 'createdAt', 'Data_Parameter', 'Data_WQI'],
      });

      const rows = [];
      for (let i = 0; i < list.length; i += gap) {
        const it = list[i];
        const dp = it?.Data_Parameter || {};
        const sensor = dp.sensor_last || dp.sensor || {};
        // forecast bisa array atau object
        const fArr = Array.isArray(dp.forecast) ? dp.forecast : (dp.forecast ? [dp.forecast] : []);
        const f1 = fArr[0] || null;

        rows.push({
          tanggal: it.Waktu_Hit_API,
          pH: numOrNull(getCI(sensor, 'pH', 'PH')),
          suhu: numOrNull(getCI(sensor, 'suhu', 'Suhu')),
          kekeruhan: numOrNull(getCI(sensor, 'kekeruhan', 'Kekeruhan')),
          salinitas: numOrNull(getCI(sensor, 'salinitas', 'Salinitas')),
          risk: f1?.risk_label ?? null,
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

export const create = async (req, res, next) => {
  try {
    const data = await TB_HistoryPeramalan.create(req.body);
    res.status(201).json({ id: data.ID_HistoryPeramalan });
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

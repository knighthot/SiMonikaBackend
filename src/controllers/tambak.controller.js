import { TB_Tambak, TB_Perangkat, TB_History } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);
    const result = await TB_Tambak.findAndCountAll({
      offset, limit, order: [["createdAt", "DESC"]],
      include: [{ model: TB_Perangkat }]
    });
    res.json(wrapPaging(result, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_Tambak.findByPk(req.params.id, {
      include: [{ model: TB_Perangkat }]
    });
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (e) { next(e); }
};

export const create = async (req, res, next) => {
  try {
    const data = await TB_Tambak.create(req.body);
    res.status(201).json({ id: data.ID_Tambak });
  } catch (e) { next(e); }
};

export const update = async (req, res, next) => {
  try {
    const data = await TB_Tambak.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    await data.update(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    const n = await TB_Tambak.destroy({ where: { ID_Tambak: req.params.id } });
    if (!n) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// extra: statistik rata-rata harian sederhana
export const statsAverage = async (req, res, next) => {
  try {
    const { ID_Tambak } = req.params;
    const rows = await TB_History.findAll({ where: { ID_Tambak }, order: [["Waktu_History", "DESC"]], limit: 1000 });
    if (!rows.length) return res.json({ count: 0 });

    const avg = (key) => {
      const vals = rows.map(r => r[key]).filter(v => typeof v === "number");
      return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : null;
    };
    res.json({
      count: rows.length,
      avg_pH: avg("pH"),
      avg_suhu: avg("suhu"),
      avg_kekeruhan: avg("kekeruhan"),
      avg_salinitas: avg("salinitas")
    });
  } catch (e) { next(e); }
};

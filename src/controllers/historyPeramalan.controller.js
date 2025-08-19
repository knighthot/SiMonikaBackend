import { TB_HistoryPeramalan, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);
    const where = {};
    if (req.query.ID_Tambak) where.ID_Tambak = req.query.ID_Tambak;
    const result = await TB_HistoryPeramalan.findAndCountAll({
      where, offset, limit, order: [["createdAt", "DESC"]],
      include: [{ model: TB_Tambak, attributes: ["ID_Tambak", "Nama"] }]
    });
    res.json(wrapPaging(result, page, limit));
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

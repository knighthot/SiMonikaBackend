import { TB_History, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);
    const where = {};
    if (req.query.ID_Tambak) where.ID_Tambak = req.query.ID_Tambak;
    const result = await TB_History.findAndCountAll({
      where, offset, limit, order: [["Waktu_History", "DESC"]],
      include: [{ model: TB_Tambak, attributes: ["ID_Tambak", "Nama"] }]
    });
    res.json(wrapPaging(result, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_History.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (e) { next(e); }
};

export const create = async (req, res, next) => {
  try {
    const data = await TB_History.create(req.body);
    res.status(201).json({ id: data.ID_History });
  } catch (e) { next(e); }
};

export const update = async (req, res, next) => {
  try {
    const data = await TB_History.findByPk(req.params.id);
   if (req.user?.role === "USER" && data.ID_Tambak !== req.user.tambakId) {
  return res.status(403).json({ message: "Forbidden" });
}
    await data.update(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    const n = await TB_History.destroy({ where: { ID_History: req.params.id } });
   if (req.user?.role === "USER") {
  const row = await TB_History.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Not found" });
  if (row.ID_Tambak !== req.user.tambakId) {
    return res.status(403).json({ message: "Forbidden" });
  }
}
    res.json({ ok: true });
  } catch (e) { next(e); }
};

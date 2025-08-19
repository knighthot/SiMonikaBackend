import { TB_Perangkat, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);
    const result = await TB_Perangkat.findAndCountAll({
      offset, limit, order: [["createdAt", "DESC"]],
      include: [{ model: TB_Tambak, attributes: ["ID_Tambak", "Nama"] }]
    });
    res.json(wrapPaging(result, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_Perangkat.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (e) { next(e); }
};

export const create = async (req, res, next) => {
  try {
    const data = await TB_Perangkat.create(req.body);
    res.status(201).json({ id: data.ID_Perangkat });
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "ID_PerangkatIot sudah dipakai" });
    }
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = await TB_Perangkat.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    await data.update(req.body);
    res.json({ ok: true });
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "ID_PerangkatIot sudah dipakai" });
    }
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    const n = await TB_Perangkat.destroy({ where: { ID_Perangkat: req.params.id } });
    if (!n) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// users.controller.js
import { TB_User, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";
import { Op } from "sequelize";

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);
    const result = await TB_User.findAndCountAll({
      offset, limit, order: [["createdAt", "DESC"]],
      attributes: { exclude: ["Password"] },
      include: [{ model: TB_Tambak, attributes: ["ID_Tambak", "Nama"] }]
    });
    res.json(wrapPaging(result, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_User.findByPk(req.params.id, {
      attributes: { exclude: ["Password"] },
      include: [{ model: TB_Tambak }]
    });
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  } catch (e) { next(e); }
};

export const create = async (req, res, next) => {
  try {
    const { ID_Tambak } = req.body;
    if (ID_Tambak) {
      const exists = await TB_User.findOne({ where: { ID_Tambak } });
      if (exists) return res.status(409).json({ message: "Tambak ini sudah memiliki user" });
    }
    const data = await TB_User.create(req.body);
    res.status(201).json({ id: data.ID_User });
  } catch (e) { next(e); }
};

export const update = async (req, res, next) => {
  try {
    const data = await TB_User.findByPk(req.params.id);
    if (!data) return res.status(404).json({ message: "Not found" });
    const { ID_Tambak } = req.body || {};
    if (ID_Tambak) {
      const exists = await TB_User.findOne({
        where: { ID_Tambak, ID_User: { [Op.ne]: req.params.id } }
      });
      if (exists) return res.status(409).json({ message: "Tambak ini sudah memiliki user" });
    }
    await data.update(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    const n = await TB_User.destroy({ where: { ID_User: req.params.id } });
    if (!n) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};


// ✅ SELF-UPDATE nama/password
export const updateMe = async (req, res, next) => {
  try {
    const userId = req.user?.id;               // <-- pakai "id" dari middleware
    if (!userId) return res.status(401).json({
      message: "Unauthorized: token tidak valid atau user tidak terdeteksi pada request.",
      code: "AUTH_MISSING_USER"
    });

    const u = await TB_User.findByPk(userId);
    if (!u) return res.status(404).json({ message: "User tidak ditemukan", code: "USER_NOT_FOUND" });

    const { Nama_tambak, Password } = req.body || {};
    const patch = {};
    if (typeof Nama_tambak !== "undefined") patch.Nama_tambak = Nama_tambak;
    if (typeof Password !== "undefined" && Password !== "") patch.Password = Password;

    await u.update(patch);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};


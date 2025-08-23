import { TB_Perangkat, TB_Tambak } from "../models/index.js";
import { buildPaging, wrapPaging } from "../utils/pagination.js";

const THRESHOLD_MIN = 10; // perangkat "Aktif" jika last seen <= 10 menit
const ACTIVE_WINDOW_MS = 10_000; 

export const list = async (req, res, next) => {
  try {
    const { page, limit, offset } = buildPaging(req.query);

    const result = await TB_Perangkat.findAndCountAll({
      offset, limit,
      order: [["createdAt", "DESC"]],
      include: [{
        model: TB_Tambak,
        attributes: ["ID_Tambak", "Nama", "Latitude", "Longitude"]
      }]
    });

    const rows = result.rows.map(r => {
      const j = r.toJSON();
      const last = j.LastSeenAt ? new Date(j.LastSeenAt).getTime() : 0;
      const alive = last && (Date.now() - last < THRESHOLD_MIN);

      const t0 = Array.isArray(j.TB_Tambaks) && j.TB_Tambaks.length ? j.TB_Tambaks[0] : null;

      return {
        ...j,
        Status: alive ? "Aktif" : "Non Aktif",
        TambakTerhubung: t0?.Nama || null,
        Latitude: t0?.Latitude ?? null,
        Longitude: t0?.Longitude ?? null,
      };
    });

    res.json(wrapPaging({ count: result.count, rows }, page, limit));
  } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try {
    const data = await TB_Perangkat.findByPk(req.params.id, {
      include: [{
        model: TB_Tambak,
        attributes: ["ID_Tambak", "Nama", "Latitude", "Longitude"]
      }]
    });
    if (!data) return res.status(404).json({ message: "Not found" });

    const now = Date.now();
    let Status = "Non Aktif";
    if (data.LastSeenAt) {
      const diffMs = now - new Date(data.LastSeenAt).getTime();
      if (diffMs <= ACTIVE_WINDOW_MS) Status = "Aktif";
    }

    const j = data.toJSON();
    const t0 = Array.isArray(j.TB_Tambaks) && j.TB_Tambaks.length ? j.TB_Tambaks[0] : null;

    res.json({
      ...j,
      Status,
      TambakTerhubung: t0?.Nama || null,
      Latitude: t0?.Latitude ?? null,
      Longitude: t0?.Longitude ?? null,
    });
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

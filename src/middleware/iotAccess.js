import { TB_Perangkat, TB_Tambak } from "../models/index.js";

/**
 * ADMIN -> diizinkan
 * USER  -> diizinkan hanya bila perangkat tertaut ke tambak miliknya (req.user.tambakId)
 */
export async function canAccessIot(req, res, next) {
  try {
    const iotId = String(req.params.iotId);
    const dev = await TB_Perangkat.findOne({ where: { ID_PerangkatIot: iotId } });
    if (!dev) return res.status(404).json({ message: "Perangkat tidak ditemukan" });

    if (req.user?.role === "ADMIN") return next();

    // USER: cek apakah perangkat ini tertaut ke tambaknya
    if (!req.user?.tambakId) return res.status(403).json({ message: "Forbidden" });

    const linked = await TB_Tambak.findOne({
      where: { ID_Perangkat: dev.ID_Perangkat, ID_Tambak: req.user.tambakId },
      attributes: ["ID_Tambak"]
    });

    if (!linked) return res.status(403).json({ message: "Forbidden" });
    next();
  } catch (e) {
    next(e);
  }
}

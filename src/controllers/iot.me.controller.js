import { TB_Perangkat, TB_Tambak } from "../models/index.js";

/**
 * Asumsi: user punya satu tambak -> req.user.tambakId
 * Jika kamu pakai multi-tambak per user (join table), sesuaikan query di bawah.
 */
export const myDevices = async (req, res, next) => {
  try {
    if (!req.user?.tambakId) {
      return res.status(400).json({ message: "User belum terikat ke tambak" });
    }

    // Cari tambak milik user dan join ke perangkat
    const tambak = await TB_Tambak.findByPk(req.user.tambakId, {
      attributes: ["ID_Tambak", "Nama", "ID_Perangkat"],
      include: [{ model: TB_Perangkat, attributes: ["ID_Perangkat", "ID_PerangkatIot", "Nama_LokasiPerangkat"] }]
    });
    if (!tambak) return res.status(404).json({ message: "Tambak tidak ditemukan" });
    if (!tambak.TB_Perangkat) return res.json([]); // belum ada perangkat

    const p = tambak.TB_Perangkat;
    res.json([{
      ID_Perangkat: p.ID_Perangkat,
      ID_PerangkatIot: p.ID_PerangkatIot,
      Nama_LokasiPerangkat: p.Nama_LokasiPerangkat,
      ID_Tambak: tambak.ID_Tambak,
      Nama_Tambak: tambak.Nama
    }]);
  } catch (e) { next(e); }
};

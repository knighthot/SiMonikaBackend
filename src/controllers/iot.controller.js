import { TB_Perangkat, TB_Tambak } from "../models/index.js";
import { startSim, getLast } from "../services/iot.simulator.js";

export const ingest = async (req, res, next) => {
  try {
    const { deviceId, payload } = req.body;  // deviceId == ID_PerangkatIot
    // ... simpan payload ke tabel log IoT kamu ...

    // update last seen
    await TB_Perangkat.update(
      { LastSeenAt: new Date() },
      { where: { ID_PerangkatIot: deviceId } }
    );

    res.json({ ok: true });
  } catch (e) { next(e); }
};

/** FE submit ID_PerangkatIot (+ optional ID_Tambak) */
export const registerIot = async (req, res, next) => {
  try {
    const { ID_PerangkatIot, Nama_LokasiPerangkat, ID_Tambak } = req.body;

    // 1) find-or-create perangkat
    const [dev, created] = await TB_Perangkat.findOrCreate({
      where: { ID_PerangkatIot },
      defaults: {
        ID_PerangkatIot,
        Nama_LokasiPerangkat: Nama_LokasiPerangkat || "Perangkat"
      }
    });

    // 2) jika diberikan ID_Tambak → tautkan
    if (ID_Tambak) {
      // jika user biasa, pastikan hanya boleh hubungkan ke tambaknya sendiri
      if (req.user?.role === "USER" && req.user?.tambakId !== ID_Tambak) {
        return res.status(403).json({ message: "Forbidden: bukan tambak milikmu" });
      }
      const tambak = await TB_Tambak.findByPk(ID_Tambak);
      if (!tambak) return res.status(404).json({ message: "Tambak tidak ditemukan" });
      await tambak.update({ ID_Perangkat: dev.ID_Perangkat });
    }

    // 3) start simulator (persist true → auto insert ke TB_History)
    startSim(ID_PerangkatIot, { persist: true });

    res.status(created ? 201 : 200).json({
      ok: true,
      created,
      perangkat: {
        ID_Perangkat: dev.ID_Perangkat,
        ID_PerangkatIot: dev.ID_PerangkatIot,
        Nama_LokasiPerangkat: dev.Nama_LokasiPerangkat
      },
      sample: getLast(ID_PerangkatIot)
    });
  } catch (e) { next(e); }
};

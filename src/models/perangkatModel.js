import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js"; // sesuaikan path

export const TB_Perangkat = sequelize.define("TB_Perangkat", {
  ID_Perangkat: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_PerangkatIot: { type: DataTypes.STRING(64), allowNull: false }, // <- tanpa unique di sini
  Nama_LokasiPerangkat: { type: DataTypes.STRING, allowNull: false },
  LastSeenAt: { type: DataTypes.DATE, allowNull: true },
}, {
  indexes: [
    { name: 'uniq_perangkat_iot', unique: true, fields: ['ID_PerangkatIot'] }
  ]
});

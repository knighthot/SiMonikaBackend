import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js"; // sesuaikan path

export const TB_Perangkat = sequelize.define("TB_Perangkat", {
  ID_Perangkat: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },

  // NEW: ID perangkat fisik dari IoT (unik)
  ID_PerangkatIot: { type: DataTypes.STRING(64), allowNull: false, unique: true },

  Nama_LokasiPerangkat: { type: DataTypes.STRING, allowNull: false },

}, {
  indexes: [
    { unique: true, fields: ["ID_PerangkatIot"] }
  ]
});

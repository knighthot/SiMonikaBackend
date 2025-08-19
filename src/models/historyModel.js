import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_History = sequelize.define("TB_History", {
  ID_History: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_Tambak: { type: DataTypes.UUID, allowNull: false }, // FK -> TB_Tambak
  Waktu_History: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  pH: { type: DataTypes.FLOAT, allowNull: true },
  suhu: { type: DataTypes.FLOAT, allowNull: true },
  kekeruhan: { type: DataTypes.FLOAT, allowNull: true },
  salinitas: { type: DataTypes.FLOAT, allowNull: true }
});

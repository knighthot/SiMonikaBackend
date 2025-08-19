import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_HistoryPeramalan = sequelize.define("TB_HistoryPeramalan", {
  ID_HistoryPeramalan: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_Tambak: { type: DataTypes.UUID, allowNull: false }, // FK -> TB_Tambak
  Tanggal_Awal: { type: DataTypes.DATEONLY, allowNull: false },
  Tanggal_Akhir: { type: DataTypes.DATEONLY, allowNull: false },
  Jumlah_Hari: { type: DataTypes.INTEGER, allowNull: false },
  Data_WQI: { type: DataTypes.JSON, allowNull: true },
  Data_Parameter: { type: DataTypes.JSON, allowNull: true },
  Ada_Anomali: { type: DataTypes.BOOLEAN, defaultValue: false },
  Detail_Anomali: { type: DataTypes.STRING, allowNull: true },
  Waktu_Hit_API: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
});

import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

const JSON_TYPE = sequelize.getDialect() === "postgres" ? DataTypes.JSONB : DataTypes.JSON;

export const TB_HistoryPeramalan = sequelize.define(
  "TB_HistoryPeramalan",
  {
    ID_HistoryPeramalan: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    ID_Tambak: { type: DataTypes.UUID, allowNull: false },
    Tanggal_Awal: { type: DataTypes.DATEONLY, allowNull: false },
    Tanggal_Akhir: { type: DataTypes.DATEONLY, allowNull: false },
    Jumlah_Hari: { type: DataTypes.INTEGER, allowNull: false },
    Data_WQI: { type: JSON_TYPE, allowNull: true },
    Data_Parameter: { type: JSON_TYPE, allowNull: true },
    Waktu_Hit_API: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "TB_HistoryPeramalan",
    timestamps: true,
    indexes: [
      { fields: ["ID_Tambak", "createdAt"] }, // ← yang ini OK
 
    ],
  }
);

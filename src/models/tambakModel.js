import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_Tambak = sequelize.define("TB_Tambak", {
  ID_Tambak: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  Nama: { type: DataTypes.STRING, allowNull: false },
  ID_Perangkat: { type: DataTypes.UUID, allowNull: true },   // FK -> TB_Perangkat
  Substrat: { type: DataTypes.STRING, allowNull: true },
  Latitude: { type: DataTypes.FLOAT, allowNull: true },
  Longitude: { type: DataTypes.FLOAT, allowNull: true },
  Keterangan: { type: DataTypes.STRING, allowNull: true }
});

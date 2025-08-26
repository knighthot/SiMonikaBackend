import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_AutoForecast = sequelize.define("TB_AutoForecast", {
  ID_Auto:         { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_Tambak:       { type: DataTypes.UUID, allowNull: false },
  ID_PerangkatIot: { type: DataTypes.UUID, allowNull: false },
  WindowStart:     { type: DataTypes.DATE, allowNull: false },
  WindowEnd:       { type: DataTypes.DATE, allowNull: false },
  Frequency:       { type: DataTypes.STRING, allowNull: false, defaultValue: "hourly" },
  Horizon:         { type: DataTypes.INTEGER, allowNull: false }, // jam, mis. 168
  Active:          { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  LastRunAt:       { type: DataTypes.DATE, allowNull: true },
  NextDueAt:       { type: DataTypes.DATE, allowNull: false },
  CooldownMin:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
}, { tableName: "TB_AutoForecast" });

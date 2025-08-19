import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_ChatSession = sequelize.define("TB_ChatSession", {
  ID_ChatSession: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_User: { type: DataTypes.UUID, allowNull: false },
  Title: { type: DataTypes.STRING, allowNull: false, defaultValue: "Percakapan Baru" }
});

import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";

export const TB_ChatMessage = sequelize.define("TB_ChatMessage", {
  ID_Message: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  ID_ChatSession: { type: DataTypes.UUID, allowNull: false },
  Role: { type: DataTypes.ENUM("system","user","assistant","tool"), allowNull: false },
  Content: { type: DataTypes.TEXT("long"), allowNull: false }
});

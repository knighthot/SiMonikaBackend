import { sequelize } from "../config/db.js";
import { TB_User } from "./UserModel.js";
import { TB_Perangkat } from "./PerangkatModel.js";
import { TB_Tambak } from "./TambakModel.js";
import { TB_History } from "./HistoryModel.js";
import { TB_HistoryPeramalan } from "./HistoryPeramalanModel.js";
import { TB_ChatSession } from "./chatSession.model.js";
import { TB_ChatMessage } from "./chatMessage.model.js";

// User 1..* Session
TB_User.hasMany(TB_ChatSession, { foreignKey: "ID_User" });
TB_ChatSession.belongsTo(TB_User, { foreignKey: "ID_User" });

// Session 1..* Message
TB_ChatSession.hasMany(TB_ChatMessage, { foreignKey: "ID_ChatSession" });
TB_ChatMessage.belongsTo(TB_ChatSession, { foreignKey: "ID_ChatSession" });


// Relasi Perangkat <-> Tambak
TB_Perangkat.hasMany(TB_Tambak, { foreignKey: "ID_Perangkat" });
TB_Tambak.belongsTo(TB_Perangkat, { foreignKey: "ID_Perangkat" });

// Relasi Tambak <-> User
TB_Tambak.hasMany(TB_User, { foreignKey: "ID_Tambak" });
TB_User.belongsTo(TB_Tambak, { foreignKey: "ID_Tambak" });

// Relasi Tambak <-> History
TB_Tambak.hasMany(TB_History, { foreignKey: "ID_Tambak" });
TB_History.belongsTo(TB_Tambak, { foreignKey: "ID_Tambak" });

// Relasi Tambak <-> HistoryPeramalan
TB_Tambak.hasMany(TB_HistoryPeramalan, { foreignKey: "ID_Tambak" });
TB_HistoryPeramalan.belongsTo(TB_Tambak, { foreignKey: "ID_Tambak" });

export async function syncDB() {
  await sequelize.sync({ alter: true }); // AUTO CREATE / ALTER TABLE
}

export {
  TB_User, TB_Perangkat, TB_Tambak, TB_History, TB_HistoryPeramalan, TB_ChatSession, TB_ChatMessage 
};

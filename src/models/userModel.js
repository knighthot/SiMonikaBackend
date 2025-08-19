import { DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config/db.js";
import bcrypt from "bcryptjs";

export const TB_User = sequelize.define("TB_User", {
  ID_User: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  Nama_tambak: { type: DataTypes.STRING, allowNull: true }, // sesuai ERD
  Password: { type: DataTypes.STRING, allowNull: false },
  Role: { type: DataTypes.ENUM("ADMIN", "USER"), allowNull: false, defaultValue: "USER" },
  ID_Tambak: { type: DataTypes.UUID, allowNull: true } // FK -> TB_Tambak
}, {
  hooks: {
    async beforeCreate(user) {
      user.Password = await bcrypt.hash(user.Password, 10);
    },
    async beforeUpdate(user) {
      if (user.changed("Password")) {
        user.Password = await bcrypt.hash(user.Password, 10);
      }
    }
  }
});

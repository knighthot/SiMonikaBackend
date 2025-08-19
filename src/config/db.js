import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    define: {
      freezeTableName: true,      // pakai nama table apa adanya (TB_User, dst)
      underscored: false
    }
  }
);

export async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log("✅ DB connected");
  } catch (e) {
    console.error("❌ DB connection failed:", e.message);
    process.exit(1);
  }
}

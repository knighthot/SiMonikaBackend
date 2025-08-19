import dotenv from "dotenv";
dotenv.config();

import { testConnection } from "../config/db.js";
import { syncDB, TB_User, TB_Tambak } from "../models/index.js";

async function main() {
  await testConnection();
  await syncDB();

  const already = await TB_User.count();
  if (already > 0) {
    console.log("Users already exist, skipping seed.");
    process.exit(0);
  }

  // buat tambak default
  const tambak = await TB_Tambak.create({
    Nama: process.env.ADMIN_TAMBAK || "Tambak Utama",
    Substrat: "Tanah",
  });

  // buat admin (password di-hash oleh hook model)
  const admin = await TB_User.create({
    Nama_tambak: process.env.ADMIN_USERNAME || "admin",
    Password: process.env.ADMIN_PASSWORD || "admin123",
    Role: "ADMIN",
    ID_Tambak: tambak.ID_Tambak
  });

  console.log("✅ Admin created:");
  console.log("  Username:", admin.Nama_tambak);
  console.log("  TambakID:", tambak.ID_Tambak);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

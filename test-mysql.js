// test-mysql.js
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { Sequelize } from 'sequelize';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASS = '',
  DB_NAME = ''
} = process.env;

async function testMysql2() {
  console.log('=== Test mysql2 (native) ===');
  let conn;
  try {
    conn = await mysql.createConnection({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME || undefined, // boleh kosong kalau cuma ping
    });
    const [rows] = await conn.query('SELECT 1 AS ok');
    console.log('mysql2 OK ->', rows[0]);
  } catch (err) {
    console.error('mysql2 ERROR ->', err.message);
    throw err;
  } finally {
    if (conn) await conn.end();
  }
}

async function testSequelize() {
  console.log('\n=== Test Sequelize ===');
  const sequelize = new Sequelize(DB_NAME || undefined, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: Number(DB_PORT),
    dialect: 'mysql',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('Sequelize OK -> authenticated');
  } catch (err) {
    console.error('Sequelize ERROR ->', err.message);
    throw err;
  } finally {
    await sequelize.close();
  }
}

(async () => {
  try {
    await testMysql2();
    await testSequelize();
    console.log('\n✅ Semua tes koneksi berhasil.');
    process.exit(0);
  } catch {
    console.error('\n❌ Tes koneksi gagal. Cek pesan error di atas.');
    process.exit(1);
  }
})();

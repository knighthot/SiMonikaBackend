import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3330;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'simonika_db';

let pool = null;

async function initDB() {
  // Connect without database first
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  // create database if not exists
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();

  // Now create pool with database
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });

  // create tables if not exists
  await createTables();
}

async function createTables() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS TB_User (
      ID_User VARCHAR(50) PRIMARY KEY,
      Nama_tambak VARCHAR(255),
      Password VARCHAR(255) NOT NULL,
      Role VARCHAR(50) DEFAULT 'user',
      ID_Tambak VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // perangkat
  await pool.query(`
    CREATE TABLE IF NOT EXISTS TB_Perangkat (
      ID_Perangkat VARCHAR(50) PRIMARY KEY,
      Nama_LokasiPerangkat VARCHAR(255),
      Endpoint_Data VARCHAR(255),
      Endpoint_Firebase VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // tambak
  await pool.query(`
    CREATE TABLE IF NOT EXISTS TB_Tambak (
      ID_Tambak VARCHAR(50) PRIMARY KEY,
      Nama VARCHAR(255),
      ID_Perangkat VARCHAR(50),
      Substrat VARCHAR(100),
      Kedalaman FLOAT,
      Latitude DOUBLE,
      Longitude DOUBLE,
      Keterangan TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ID_Perangkat) REFERENCES TB_Perangkat(ID_Perangkat) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // history
  await pool.query(`
    CREATE TABLE IF NOT EXISTS TB_History (
      ID_History VARCHAR(50) PRIMARY KEY,
      ID_Tambak VARCHAR(50),
      Waktu_History DATETIME,
      pH FLOAT,
      suhu FLOAT,
      kekeruhan FLOAT,
      salinitas FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ID_Tambak) REFERENCES TB_Tambak(ID_Tambak) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // history peramalan
  await pool.query(`
    CREATE TABLE IF NOT EXISTS TB_HistoryPeramalan (
      ID_HistoryPeramalan VARCHAR(50) PRIMARY KEY,
      ID_Tambak VARCHAR(50),
      Tanggal_Awal DATE,
      Tanggal_Akhir DATE,
      Jumlah_Hari INT,
      Data_WQI JSON,
      Data_Parameter JSON,
      Ada_Anomali BOOLEAN DEFAULT false,
      Detail_Anomali TEXT,
      Waktu_Hit_API DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ID_Tambak) REFERENCES TB_Tambak(ID_Tambak) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function getPool() {
  if (!pool) throw new Error('Pool not initialized. Call initDB first.');
  return pool;
}

module.exports = { initDB, getPool };
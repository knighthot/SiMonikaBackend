const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/db');
const generateToken = require('../utils/generateToken');
const { v4: uuidv4 } = require('uuid');

// register
const registerUser = asyncHandler(async (req, res) => {
  const { Nama_tambak, password, Role, ID_Tambak, ID_User } = req.body;
  if (!Nama_tambak || !password || !ID_User) {
    res.status(400);
    throw new Error('ID_User, Nama_tambak and password required');
  }
  const pool = getPool();
  const [exists] = await pool.query('SELECT ID_User FROM TB_User WHERE ID_User = ?', [ID_User]);
  if (exists.length) {
    res.status(409);
    throw new Error('User already exists');
  }
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);
  await pool.query('INSERT INTO TB_User (ID_User, Nama_tambak, Password, Role, ID_Tambak) VALUES (?, ?, ?, ?, ?)', [ID_User, Nama_tambak, hashed, Role || 'user', ID_Tambak || null]);
  const token = generateToken({ id: ID_User });
  res.status(201).json({ ID_User, Nama_tambak, Role: Role || 'user', token });
});

// login
const authUser = asyncHandler(async (req, res) => {
  const { ID_User, password } = req.body;
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM TB_User WHERE ID_User = ?', [ID_User]);
  if (!rows.length) {
    res.status(401);
    throw new Error('Invalid credentials');
  }
  const user = rows[0];
  const match = await bcrypt.compare(password, user.Password);
  if (!match) {
    res.status(401);
    throw new Error('Invalid credentials');
  }
  const token = generateToken({ id: user.ID_User });
  res.json({ ID_User: user.ID_User, Nama_tambak: user.Nama_tambak, Role: user.Role, token });
});

// get profile (protected)
const getProfile = asyncHandler(async (req, res) => {
  res.json(req.user);
});

module.exports = { registerUser, authUser, getProfile };
// src/controllers/perangkatController.js
const asyncHandler = require('express-async-handler');
const db = require('../config/db');

// Ambil semua perangkat
const getPerangkat = asyncHandler(async (req, res) => {
  const [rows] = await db.promise().query('SELECT * FROM perangkat');
  res.json(rows);
});

// Tambah perangkat baru
const addPerangkat = asyncHandler(async (req, res) => {
  const { nama, tipe, lokasi } = req.body;
  if (!nama || !tipe) {
    res.status(400);
    throw new Error('Nama dan tipe perangkat wajib diisi');
  }
  const [result] = await db
    .promise()
    .query('INSERT INTO perangkat (nama, tipe, lokasi) VALUES (?, ?, ?)', [nama, tipe, lokasi]);
  res.status(201).json({ id: result.insertId, nama, tipe, lokasi });
});

// Update perangkat
const updatePerangkat = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nama, tipe, lokasi, status } = req.body;
  await db
    .promise()
    .query(
      'UPDATE perangkat SET nama=?, tipe=?, lokasi=?, status=? WHERE id=?',
      [nama, tipe, lokasi, status, id]
    );
  res.json({ message: 'Perangkat berhasil diperbarui' });
});

// Hapus perangkat
const deletePerangkat = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.promise().query('DELETE FROM perangkat WHERE id = ?', [id]);
  res.json({ message: 'Perangkat dihapus' });
});

module.exports = {
  getPerangkat,
  addPerangkat,
  updatePerangkat,
  deletePerangkat
};

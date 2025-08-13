const asyncHandler = require('express-async-handler');
const db = require('../config/db');


const getTambak = asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM tambak');
  res.json(rows);
});

const addTambak = asyncHandler(async (req, res) => {
  const { nama, lokasi, luas, id_perangkat } = req.body;

  if (!nama || !lokasi || !luas) {
    res.status(400);
    throw new Error('Nama, lokasi, dan luas wajib diisi');
  }

  const [result] = await db.query(
    'INSERT INTO tambak (nama, lokasi, luas, id_perangkat) VALUES (?, ?, ?, ?)',
    [nama, lokasi, luas, id_perangkat || null]
  );

  res.status(201).json({ message: 'Tambak berhasil ditambahkan', id: result.insertId });
});

const updateTambak = asyncHandler(async (req, res) => {
  const { nama, lokasi, luas, id_perangkat } = req.body;
  const [result] = await db.query(
    'UPDATE tambak SET nama = ?, lokasi = ?, luas = ?, id_perangkat = ? WHERE id = ?',
    [nama, lokasi, luas, id_perangkat || null, req.params.id]
  );

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Tambak tidak ditemukan');
  }

  res.json({ message: 'Tambak berhasil diupdate' });
});

// @desc    Delete tambak
// @route   DELETE /api/tambak/:id
// @access  Public
const deleteTambak = asyncHandler(async (req, res) => {
  const [result] = await db.query('DELETE FROM tambak WHERE id = ?', [req.params.id]);

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Tambak tidak ditemukan');
  }

  res.json({ message: 'Tambak berhasil dihapus' });
});

module.exports = {
  getTambak,
  addTambak,
  updateTambak,
  deleteTambak
};

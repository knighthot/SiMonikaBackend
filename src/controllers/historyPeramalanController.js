const asyncHandler = require('express-async-handler');
const db = require('../config/db');

// @desc    Get all forecasting history
// @route   GET /api/history-peramalan
// @access  Public
const getAllHistoryPeramalan = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM history_peramalan ORDER BY created_at DESC'
  );
  res.json(rows);
});

// @desc    Get forecasting history by device ID
// @route   GET /api/history-peramalan/device/:id
// @access  Public
const getHistoryPeramalanByDevice = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM history_peramalan WHERE id_perangkat = ? ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});

// @desc    Add new forecasting history
// @route   POST /api/history-peramalan
// @access  Public
const addHistoryPeramalan = asyncHandler(async (req, res) => {
  const { id_perangkat, parameter, nilai, hasil_peramalan, akurasi } = req.body;

  if (!id_perangkat || !parameter || nilai === undefined || hasil_peramalan === undefined) {
    res.status(400);
    throw new Error('id_perangkat, parameter, nilai, dan hasil_peramalan wajib diisi');
  }

  const [result] = await db.query(
    'INSERT INTO history_peramalan (id_perangkat, parameter, nilai, hasil_peramalan, akurasi) VALUES (?, ?, ?, ?, ?)',
    [id_perangkat, parameter, nilai, hasil_peramalan, akurasi || null]
  );

  res.status(201).json({
    message: 'History peramalan berhasil ditambahkan',
    id: result.insertId
  });
});

// @desc    Delete forecasting history
// @route   DELETE /api/history-peramalan/:id
// @access  Public
const deleteHistoryPeramalan = asyncHandler(async (req, res) => {
  const [result] = await db.query(
    'DELETE FROM history_peramalan WHERE id = ?',
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('History peramalan tidak ditemukan');
  }

  res.json({ message: 'History peramalan berhasil dihapus' });
});

module.exports = {
  getAllHistoryPeramalan,
  getHistoryPeramalanByDevice,
  addHistoryPeramalan,
  deleteHistoryPeramalan
};

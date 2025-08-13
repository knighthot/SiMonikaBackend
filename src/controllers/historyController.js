const asyncHandler = require('express-async-handler');
const db = require('../config/db');

// @desc    Get all history
// @route   GET /api/history
// @access  Public
const getHistory = asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM history ORDER BY created_at DESC');
  res.json(rows);
});

// @desc    Get history by device ID
// @route   GET /api/history/device/:id
// @access  Public
const getHistoryByDevice = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM history WHERE id_perangkat = ? ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});

// @desc    Add new history log
// @route   POST /api/history
// @access  Public
const addHistory = asyncHandler(async (req, res) => {
  const { id_perangkat, parameter, nilai, status } = req.body;

  if (!id_perangkat || !parameter || nilai === undefined) {
    res.status(400);
    throw new Error('id_perangkat, parameter, dan nilai wajib diisi');
  }

  const [result] = await db.query(
    'INSERT INTO history (id_perangkat, parameter, nilai, status) VALUES (?, ?, ?, ?)',
    [id_perangkat, parameter, nilai, status || null]
  );

  res.status(201).json({
    message: 'History berhasil ditambahkan',
    id: result.insertId
  });
});

// @desc    Delete history log
// @route   DELETE /api/history/:id
// @access  Public
const deleteHistory = asyncHandler(async (req, res) => {
  const [result] = await db.query('DELETE FROM history WHERE id = ?', [req.params.id]);

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('History tidak ditemukan');
  }

  res.json({ message: 'History berhasil dihapus' });
});

module.exports = {
  getHistory,
  getHistoryByDevice,
  addHistory,
  deleteHistory
};

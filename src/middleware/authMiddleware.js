const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { getPool } = require('../config/db');

const protect = asyncHandler(async (req, res, next) => {
  let token = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, token missing');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // fetch user minimal data
    const pool = getPool();
    const [rows] = await pool.query('SELECT ID_User, Nama_tambak, Role, ID_Tambak FROM TB_User WHERE ID_User = ?', [decoded.id]);
    if (!rows.length) {
      res.status(401);
      throw new Error('User not found');
    }
    req.user = rows[0];
    next();
  } catch (err) {
    res.status(401);
    throw new Error('Not authorized, token invalid');
  }
});

module.exports = { protect };
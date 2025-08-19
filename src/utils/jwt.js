import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Biar error-nya jelas saat boot
  throw new Error("JWT_SECRET is not set. Define it in your .env and restart the server.");
}

export function signJWT(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", ...options });
}

export function verifyJWT(token) {
  return jwt.verify(token, JWT_SECRET);
}

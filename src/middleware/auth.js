import { verifyJWT } from "../utils/jwt.js";
import { TB_User, TB_Tambak } from "../models/index.js";

/**
 * Ambil token dari Authorization: Bearer <token>
 */
function getTokenFromHeader(req) {
  const hdr = req.headers.authorization || "";
  const [scheme, token] = hdr.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token;
  return null;
}

/**
 * Wajib login
 */
export async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = verifyJWT(token); // { sub, role, ... }
    // muat user sekalian relasi tambak (optional)
    const user = await TB_User.findByPk(payload.sub, {
      include: [{ model: TB_Tambak, attributes: ["ID_Tambak", "Nama"] }]
    });
    if (!user) return res.status(401).json({ message: "Invalid token" });

    req.user = {
      id: user.ID_User,
      role: user.Role,
      tambakId: user.ID_Tambak || null,
      tambak: user.TB_Tambak || null
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized", error: err.message });
  }
}

/**
 * Batasi role: requireRole("ADMIN") atau requireRole("USER","ADMIN")
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

import bcrypt from "bcryptjs";
import { signJWT } from "../utils/jwt.js";
import { TB_User, TB_Tambak } from "../models/index.js";

export const register = async (req, res, next) => {
  try {
    const user = await TB_User.create(req.body);
    const token = signJWT({ sub: user.ID_User, role: user.Role });
    res.status(201).json({ token, user: { id: user.ID_User, role: user.Role } });
  } catch (e) { next(e); }
};

export const login = async (req, res, next) => {
  try {
    const { Nama_tambak, Password } = req.body;
    const user = await TB_User.findOne({ where: { Nama_tambak } });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(Password, user.Password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signJWT({ sub: user.ID_User, role: user.Role });
    res.json({ token, user: { id: user.ID_User, role: user.Role } });
  } catch (e) { next(e); }
};

export const me = async (req, res) => {
  const user = await TB_User.findByPk(req.user.id, {
    attributes: { exclude: ["Password"] },
    include: [{ model: TB_Tambak }]
  });
  res.json(user);
};

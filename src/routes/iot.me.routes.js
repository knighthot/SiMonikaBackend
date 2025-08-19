import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { myDevices } from "../controllers/iot.me.controller.js";

const r = Router();
r.get("/my", requireAuth, myDevices);  // daftar perangkat milik user (berdasar tambak)
export default r;

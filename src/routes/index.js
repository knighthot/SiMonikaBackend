import { Router } from "express";
import auth from "./auth.routes.js";
import users from "./users.routes.js";
import perangkat from "./perangkat.routes.js";
import tambak from "./tambak.routes.js";
import history from "./history.routes.js";
import historyPeramalan from "./historyPeramalan.routes.js";
import chat from "./chat.routes.js";
import iot from "./iot.routes.js";
import iotMe from "./iot.me.routes.js";
import aiRoutes from "./ai.routes.js";
import peramalan from "./peramalan.routes.js";
const api = Router();



api.use("/auth", auth);
api.use("/users", users);
api.use("/perangkat", perangkat);
api.use("/tambak", tambak);
api.use("/history", history);
api.use("/history-peramalan", historyPeramalan);
api.use("/chat", chat);
 api.use("/iot", iot);     // r.get('/', '/:id', '/list', dst
 api.use("/iot", iotMe); 
 api.use("/ai", aiRoutes);
 api.use("/peramalan", peramalan);
export default api;

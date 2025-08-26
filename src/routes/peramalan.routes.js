// routes/peramalan.routes.js
import express from "express";
import { forecast, autoStart, autoStop, autoForecastTick } from "../controllers/peramalan.controller.js";

const r = express.Router();

r.post("/forecast", forecast);
r.post("/auto/start", autoStart);
r.post("/auto/stop", autoStop);
r.post("/auto/tick", autoForecastTick);

export default r;

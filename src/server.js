import dotenv from "dotenv";
dotenv.config();

import app from "../app.js";
import { testConnection } from "./config/db.js";
import { syncDB } from "./models/index.js";
import { startAutoForecastWorker } from "./worker/autoForecast.worker.js";
const PORT = process.env.PORT || 4000;

(async () => {
  await testConnection();
  await syncDB(); // <-- tabel dibuat/diupdate di sini
  app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));

  startAutoForecastWorker();
})();

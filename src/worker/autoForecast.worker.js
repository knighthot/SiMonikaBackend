// src/worker/autoForecast.worker.js
import { autoForecastTick } from "../controllers/peramalan.controller.js";

/**
 * Worker interval yang memanggil autoForecastTick secara periodik.
 * Default setiap 60 detik; logic due date ada di controller.
 */

let _timer = null;
let _running = false;

function makeResShim() {
  // Respon shim agar autoForecastTick (Express) bisa dipanggil langsung
  return {
    _code: 200,
    status(code) { this._code = code; return this; },
    json(payload) {
      if (this._code >= 400) {
        console.error("[autoForecast] tick returned", this._code, payload);
      }
    },
    setHeader() { /* no-op */ }
  };
}

export function startAutoForecastWorker({ intervalMs = 60_000 } = {}) {
  if (_timer) return; // sudah jalan
  _timer = setInterval(async () => {
    if (_running) return;
    _running = true;
    try {
      await autoForecastTick(
        { body: {}, query: {} },   // req
        makeResShim(),             // res
        (err) => err && console.error("[autoForecast] next(err):", err)
      );
    } catch (e) {
      console.error("[autoForecast] tick failed:", e?.message || e);
    } finally {
      _running = false;
    }
  }, intervalMs);

console.log(`[autoForecast] worker started (every ${intervalMs/1000}s)`);
}

export function stopAutoForecastWorker() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[autoForecast] worker stopped");
  }
}

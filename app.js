import express from "express";
import cors from "cors";
import morgan from "morgan";
import { notFound, errorHandler } from "./src/middleware/error.js"; // atau middlewares/error.js kalau foldernya jamak
import api from "./src/routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

// Health check duluan
app.get("/", (_req, res) => {
  res.json({ ok: true, message: "SiMonika API running" });
});

// Pasang semua router sebelum 404
app.use("/api", api);

// (Opsional) biar nggak spam 404 favicon di log
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// PALING BAWAH: 404 & error handler
app.use(notFound);
app.use(errorHandler);

export default app;

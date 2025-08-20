import OpenAI from "openai";
import { TB_ChatSession, TB_ChatMessage } from "../models/index.js";
import { searchShared } from "../utils/rag.shared.js";
import { Op } from "sequelize"

// util: ambil OpenAI API key dari header (BYOK) atau fallback ENV
function getServerOpenAIKey() {
  const k = process.env.OPEN_AI_KEY;
  if (!k) {
    const err = new Error("OPEN_AI_KEY is not set on server");
    err.status = 500;
    throw err;
  }
  return k;
}

function buildSystemPrompt() {
  return [
    "Kamu adalah asisten teknis untuk aplikasi SiMonika.",
    "Jawab ringkas, akurat, dan gunakan konteks dokumen jika relevan.",
    "Jika data tidak ada di konteks, jawab jujur dan sarankan langkah pengukuran."
  ].join(" ");
}

export const createSession = async (req, res, next) => {
  try {
    const s = await TB_ChatSession.create({
      ID_User: req.user.id,
      Title: req.body?.title || "Percakapan Baru"
    });
    res.status(201).json({ id: s.ID_ChatSession, title: s.Title });
  } catch (e) { next(e); }
};

export const listSessions = async (req, res, next) => {
  try {
    const rows = await TB_ChatSession.findAll({
      where: { ID_User: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50
    });
    res.json(rows);
  } catch (e) { next(e); }
};

async function loadHistory(sessionId, userId, limit = 30) {
  const sess = await TB_ChatSession.findOne({ where: { ID_ChatSession: sessionId, ID_User: userId } });
  if (!sess) return null;

  const msgs = await TB_ChatMessage.findAll({
    where: { ID_ChatSession: sessionId },
    order: [["createdAt", "ASC"]],
    limit
  });

  // map ke format OpenAI chat
  const messages = msgs.map(m => ({ role: m.Role, content: m.Content }));
  return { sess, messages };
}


export const sendMessage = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { prompt, model = "gpt-3.5-turbo-0125" } = req.body || {};
    if (!prompt) return res.status(400).json({ message: "prompt is required" });

    // pastikan session milik user
    const sess = await TB_ChatSession.findOne({
      where: { ID_ChatSession: sessionId, ID_User: req.user.id }
    });
    if (!sess) return res.status(404).json({ message: "Session not found" });

    // ambil history lama
    const oldMsgs = await TB_ChatMessage.findAll({
      where: { ID_ChatSession: sessionId },
      order: [["createdAt", "ASC"]],
      limit: 30
    });
    const history = oldMsgs.map(m => ({ role: m.Role, content: m.Content }));

    // RAG shared
    const ctxDocs = await searchShared(prompt, 4);
    const system =
      "Kamu adalah asisten teknis untuk aplikasi SiMonika. " +
      "Jawab ringkas, akurat, dan gunakan konteks dokumen jika relevan. " +
      "Jika data tidak ada di konteks, jawab jujur dan sarankan langkah pengukuran." +
      (ctxDocs.length ? `\n\nKONTEXT DOKUMEN:\n${ctxDocs.join("\n---\n")}` : "");

    const openai = new OpenAI({ apiKey: getServerOpenAIKey() });

    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: prompt }
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.2
    });

    const answer = completion.choices?.[0]?.message?.content ?? "";

    // SIMPAN RIWAYAT (pakai kolom 'Content' besar; tanpa updateOnDuplicate)
    await TB_ChatMessage.create({
      ID_ChatSession: sessionId,
      Role: "user",
      Content: prompt
    });
    await TB_ChatMessage.create({
      ID_ChatSession: sessionId,
      Role: "assistant",
      Content: answer
    });

    res.json({ answer });
  } catch (e) {
    next(e);
  }
};

// SSE stream: GET /api/chat/sessions/:id/stream?q=...
export const streamMessage = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const prompt = req.query.q || req.query.prompt;
    const model = String(req.query.model || "gpt-4o-mini");

    if (!prompt) return res.status(400).end("missing q");

    const hist = await loadHistory(sessionId, req.user.id);
    if (!hist) return res.status(404).end("session not found");

    const ctxDocs = await searchShared(String(prompt), 4);
    const system = buildSystemPrompt() +
      (ctxDocs.length ? `\n\nKONTEXT DOKUMEN:\n${ctxDocs.join("\n---\n")}` : "");

    const openai = new OpenAI({ apiKey: getServerOpenAIKey(req) });

    const messages = [
      { role: "system", content: system },
      ...hist.messages,
      { role: "user", content: String(prompt) }
    ];

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let full = "";

    const stream = await openai.chat.completions.create({
      model, messages, temperature: 0.2, stream: true
    }); // streaming via SSE-like chunks. :contentReference[oaicite:4]{index=4}

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) {
        full += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    // simpan historinya setelah selesai
    await TB_ChatMessage.bulkCreate([
      { ID_ChatSession: sessionId, Role: "user", Content: String(prompt) },
      { ID_ChatSession: sessionId, Role: "assistant", Content: full }
    ]);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    // lapor error ke client SSE
    try { res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`); } catch {}
    next(e);
  }
};

// GET /api/chat/sessions/:id/messages?limit=50&before=2025-01-01T00:00:00.000Z&order=ASC
export const getMessages = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const order = String(req.query.order || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
    const before = req.query.before ? new Date(String(req.query.before)) : null;

    // pastikan sesi milik user
    const sess = await TB_ChatSession.findOne({
      where: { ID_ChatSession: sessionId, ID_User: req.user.id }
    });
    if (!sess) return res.status(404).json({ message: "Session not found" });

    const where = { ID_ChatSession: sessionId };
    if (before) where.createdAt = { [Op.lt]: before };

    const rows = await TB_ChatMessage.findAll({
      where,
      order: [["createdAt", order]],
      limit
    });

    // kirim format yang ringan untuk FE
    res.json(rows.map(r => ({
      id: r.ID_Message,
      role: r.Role,
      content: r.Content,
      createdAt: r.createdAt
    })));
  } catch (e) { next(e); }
};

// DELETE /api/chat/sessions/:id
export const deleteSession = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    // pastikan milik user
    const sess = await TB_ChatSession.findOne({
      where: { ID_ChatSession: sessionId, ID_User: req.user.id }
    });
    if (!sess) return res.status(404).json({ message: "Session not found" });

    // hapus pesan dulu baru sesi
    await TB_ChatMessage.destroy({ where: { ID_ChatSession: sessionId } });
    await TB_ChatSession.destroy({ where: { ID_ChatSession: sessionId } });
    res.status(204).end();
  } catch (e) { next(e); }
};
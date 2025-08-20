import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as c from "../controllers/chat.controller.js";

const r = Router();

r.post("/sessions", requireAuth, c.createSession);
r.get("/sessions", requireAuth, c.listSessions);
r.post("/sessions/:id/messages", requireAuth, c.sendMessage);  // non-stream
r.get("/sessions/:id/stream", requireAuth, c.streamMessage);   // SSE stream (pakai ?q=)
r.get("/sessions/:id/messages", requireAuth, c.getMessages);
r.delete("/sessions/:id", requireAuth, c.deleteSession);

export default r;

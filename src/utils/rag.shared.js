import { ChromaClient } from "chromadb";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import dotenv from "dotenv";

dotenv.config();

const RAG_DIR = process.env.RAG_SHARED_DIR || path.join(process.cwd(), "storage", "rag_shared");
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });
const chroma = new ChromaClient({ path: "http://localhost:8000" });

const COLLECTION = "tambak_docs_shared"; // satu koleksi untuk semua user

function chunkText(text, size = 1200) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function bacaFile(fullPath) {
  const lower = fullPath.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const buf = fs.readFileSync(fullPath);
    const data = await pdf(buf);
    return data.text || "";
  }
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ path: fullPath });
    return result.value || "";
  }
  return fs.readFileSync(fullPath, "utf-8");
}

function listFiles(dir, allowedExt = [".pdf", ".docx", ".txt", ".md"]) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(n => path.join(dir, n))
    .filter(p => fs.statSync(p).isFile())
    .filter(p => allowedExt.includes(path.extname(p).toLowerCase()));
}

async function getOrCreateShared() {
  return await chroma.getOrCreateCollection({
    name: COLLECTION,
    embeddingFunction: null // kita kirim embedding manual
  });
}

/** Rebuild total index: hapus koleksi lalu buat ulang dari folder shared */
export async function rebuildSharedIndex() {
  // hapus lama (jika ada), lalu create baru
  try { await chroma.deleteCollection({ name: COLLECTION }); } catch {}
  const col = await getOrCreateShared();

  const files = listFiles(RAG_DIR);
  if (!files.length) {
    console.warn(`⚠️ Tidak ada file di folder: ${RAG_DIR}`);
    return { indexedFiles: 0, indexedChunks: 0 };
  }

  let totalChunks = 0;

  for (const fullPath of files) {
    const file = path.basename(fullPath);
    const text = await bacaFile(fullPath);
    const chunks = chunkText(text, 1200);
    if (!chunks.length) continue;

    const ids = [];
    const docs = [];
    const embs = [];
    const metas = [];

    // embed per chunk
    for (let i = 0; i < chunks.length; i++) {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunks[i]
      });
      ids.push(`${file}::${i}`);
      docs.push(chunks[i]);
      embs.push(emb.data[0].embedding);
      metas.push({ file, idx: i });
    }

    await col.add({ ids, documents: docs, embeddings: embs, metadatas: metas });
    totalChunks += chunks.length;
    console.log(`✅ ${file}: ${chunks.length} chunk diindeks`);
  }

  return { indexedFiles: files.length, indexedChunks: totalChunks };
}

/** Cari konteks global (dipakai semua user) */
export async function searchShared(query, topK = 4) {
  const col = await getOrCreateShared();
  const qEmb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  });
  const results = await col.query({
    queryEmbeddings: [qEmb.data[0].embedding],
    nResults: topK
  });
  return results.documents?.[0] || [];
}

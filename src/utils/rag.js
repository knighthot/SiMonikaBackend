import { ChromaClient } from "chromadb";
import OpenAI from "openai";
import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js"
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import mammoth from "mammoth"; // untuk baca docx

dotenv.config();

// Setup __dirname di ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY
});

const chroma = new ChromaClient({
  path: "http://localhost:8000" // pastikan chromadb server jalan
});

// Lokasi folder dokumen
const DOCS_DIR = path.join(__dirname, "..", "docs");

// Fungsi baca berbagai format
async function bacaFile(filePath) {
  if (filePath.endsWith(".pdf")) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } else if (filePath.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else {
    return fs.readFileSync(filePath, "utf-8");
  }
}

// 1) Buat koleksi tanpa default embedding
async function initDB() {
  try {
    return await chroma.getOrCreateCollection({
      name: "tambak_docs",
      embeddingFunction: null
    });
  } catch (err) {
    console.error("❌ Gagal membuat/mengambil koleksi:", err);
    return null;
  }
}

// 2) Masukkan dokumen
export async function ingestDocs() {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR);
    console.warn(`⚠️ Folder docs kosong, dibuat di: ${DOCS_DIR}`);
    return;
  }

  const files = fs.readdirSync(DOCS_DIR);
  if (files.length === 0) {
    console.warn(`⚠️ Tidak ada file di folder docs: ${DOCS_DIR}`);
    return;
  }

  const collection = await initDB();
  if (!collection) return;

  for (const file of files) {
  
   const text = await bacaFile(path.join(DOCS_DIR, file));


    // Buat embedding dengan OpenAI
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text
    });

    await collection.add({
      ids: [file],
      documents: [text],
      embeddings: [embedding.data[0].embedding]
    });

    console.log(`✅ ${file} di-embedding dan disimpan`);
  }
}

// 3) Cari referensi berdasarkan pertanyaan
export async function searchDocs(query) {
  const collection = await initDB();
  if (!collection) return [];

  const qEmbed = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  });

  const results = await collection.query({
    query_embeddings: [qEmbed.data[0].embedding],
    n_results: 3
  });

  return results.documents?.[0] || [];
}

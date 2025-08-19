import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { ingestDocs, searchDocs } from "./src/utils/rag.shared.js";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY
  
});

// Endpoint untuk ingest dokumen (jalankan sekali-sekali aja)
app.post("/ingest", async (req, res) => {
  try {
    await ingestDocs();
    res.json({ success: true, message: "Dokumen di-ingest" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint tanya jawab
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    // Cari referensi dari dokumen
    const refs = await searchDocs(question);

    // Gabungkan referensi jadi context
    const context = refs.join("\n");

    // Kirim ke OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Gunakan konteks berikut untuk menjawab pertanyaan pengguna." },
        { role: "system", content: context },
        { role: "user", content: question }
      ]
    });

    const answer = completion.choices[0].message.content;

    res.json({
      question,
      context: refs,
      answer
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server jalan di http://localhost:30001");
});

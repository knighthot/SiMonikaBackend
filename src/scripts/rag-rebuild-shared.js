import dotenv from "dotenv";
dotenv.config();

import { rebuildSharedIndex } from "../utils/rag.shared.js";

async function main() {
  const res = await rebuildSharedIndex();
  console.log("🔁 Rebuild selesai:", res);
  process.exit(0);
}

main().catch(e => {
  console.error("Rebuild error:", e);
  process.exit(1);
});

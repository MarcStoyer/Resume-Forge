import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const app = express();
app.use(express.json({ limit: "25mb" }));

app.post("/api/claude", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: { message: "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key." },
    });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: { message: "Upstream request failed: " + String(e) } });
  }
});

const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n  Résumé Forge API listening on http://localhost:${PORT}`);
  if (!API_KEY) console.log("  ⚠  No ANTHROPIC_API_KEY found — AI features will error until you set it in .env\n");
  else console.log("  ✓  API key loaded.\n");
});

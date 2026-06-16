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

// --- Claude proxy ----------------------------------------------------------
app.post("/api/claude", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key." } });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: { message: "Upstream request failed: " + String(e) } });
  }
});

// --- URL fetch (for job-posting URLs) --------------------------------------
// Browser can't fetch arbitrary URLs due to CORS, so we proxy server-side.
// Many job boards (LinkedIn, Workday, etc.) require JS or auth; this is best-effort.
app.post("/api/fetch-url", async (req, res) => {
  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: { message: "Missing 'url' in request body." } });
  }
  try {
    const r = await fetch(url, {
      headers: {
        // Pretend to be a real browser; some sites refuse curl-style requests
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!r.ok) {
      return res.status(200).json({ ok: false, status: r.status, html: "", text: "", message: `HTTP ${r.status} — site may require login or block automated fetches.` });
    }
    const html = await r.text();
    // Cheap server-side text extraction so the next request to Claude is smaller.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000); // generous cap; Claude can handle this
    res.json({ ok: true, status: r.status, text });
  } catch (e) {
    res.status(200).json({ ok: false, status: 0, html: "", text: "", message: "Couldn't fetch that URL: " + String(e) });
  }
});

// --- Production static serve ------------------------------------------------
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n  Résumé Forge API listening on http://localhost:${PORT}`);
  if (!API_KEY) console.log("  ⚠  No ANTHROPIC_API_KEY found — set it in .env\n");
  else console.log("  ✓  API key loaded.\n");
});

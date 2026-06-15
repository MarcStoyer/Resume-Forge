# Résumé Forge

A local-first résumé builder. Keep one **master bullet bank**, toggle whole jobs or
single lines with a click, switch between **multiple layout templates**, and paste in
a job description to have AI **automatically select your best-matching bullets**.
Upload any existing CV to start from it. Export a clean, ATS-friendly PDF.

Built as a portfolio project: full-stack React + Vite app with an Express backend
that integrates the Claude API (document parsing, server-side web search, structured
JSON extraction) without ever exposing the API key to the browser.

---

## Features

- **Master bullet bank** — every accomplishment in one place; pick 4–6 per application.
- **Whole-job toggles** — uncheck a job or school header to drop the entire entry.
- **Tailor to a job** — paste a job description and AI picks the best-matching bullets, with one-click apply and undo.
- **Multiple templates** — Classic, Modern, Compact, and a Two-Column layout.
- **Inline editing** — edit any bullet, title, date, or contact field directly.
- **Upload any CV** — drop `.pdf`, `.docx`, `.txt`, or image; Claude parses it into the editable structure.
- **AI-written bullets** — per job, generate achievement-oriented bullets.
- **Web-sourced bullets** — per job, run a live web search and draft bullets from real listings.
- **One-click PDF** — exports through the browser's print dialog as selectable, ATS-readable text.
- **Auto-save** — your work persists in `localStorage`.

---

## Setup (running it locally)

You need **Node.js 18+** and an **Anthropic API key** (<https://console.claude.com>).

```bash
npm install
cp .env.example .env       # then open .env and paste your key
npm run dev                # starts frontend + backend together
```

Open <http://localhost:5173>.

For the **web-search** button, enable the web search tool once in the Anthropic
Console (Settings → tool/privacy). AI bullets, CV parsing, and the job matcher all
work without it.

### Production build

```bash
npm run build
npm start                  # Express serves dist/ AND the proxy on port 8787
```

---

## How the API key stays safe

The browser only calls `POST /api/claude` on your own server. The Express backend
(`server/index.js`) attaches `x-api-key` and forwards to `https://api.anthropic.com`.
The key lives in `.env` (git-ignored) and never ships to the client.

---

## Project structure

```
resume-forge/
├── server/
│   └── index.js                # Express proxy + static file server
├── src/
│   ├── main.jsx                # React entry
│   ├── index.css               # Tailwind + print styles
│   ├── components/
│   │   ├── ResumeBuilder.jsx   # main UI, state, upload/AI/web handlers
│   │   ├── Preview.jsx         # template-aware printable preview
│   │   └── JobMatcher.jsx      # paste-JD bullet matcher
│   ├── data/
│   │   └── defaultResume.js    # seed content / master bank
│   └── lib/
│       ├── api.js              # callClaude() → /api/claude
│       ├── parse.js            # JSON extraction + CV → state mapping
│       ├── storage.js          # localStorage persistence
│       ├── templates.js        # layout templates
│       ├── constants.js        # colors
│       └── util.js             # id helper
├── .env.example
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Tech stack

React 18 · Vite 5 · Tailwind CSS 3 · Express 4 · mammoth (DOCX text extraction) ·
Claude API (`claude-sonnet-4-6`, web search tool, PDF/image document input).

---

## A note on AI / web bullets

Generated bullets are **drafts** built from typical responsibilities, not your actual
accomplishments. Always edit them to be true and specific before submitting.

---

## License

MIT.

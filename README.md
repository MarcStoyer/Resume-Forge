# Résumé Forge

Local-first résumé builder with master bullet bank, whole-job toggles, drag-and-drop
reordering, AI-powered tailoring with a configurable honesty slider, JD-aware bullet
rewrites, cover letter generation, and PDF + DOCX export.

## Features

- **Master bullet bank** — every accomplishment in one place; pick per application.
- **Whole-job and whole-section toggles** — drop entire jobs or schools in one click.
- **Drag-and-drop reordering** — move sections (Education above Experience, etc.), reorder jobs, reorder bullets within a job.
- **Select All / None** at section and entry level.
- **Tailor to a job** — paste a JD and pick a mode:
  - *Just pick* — surfaces your best-matching bullets.
  - *Full auto-tailor* — picks bullets, rewrites them, rewrites summary, drafts cover letter, all in one go.
- **Honesty slider (0–100, default 75)** — controls every AI rewrite. 75 = reword without inventing. 100 = literally no changes. 0 = aggressive fabrication (with warnings).
- **Per-bullet JD rewrite** — every bullet has a "JD" button to tailor just that one line.
- **AI profile summary** — generates a tailored summary from your bullets.
- **Cover letter tab** — generates from your CV + JD + honesty; edit freely; export to DOCX or print to PDF.
- **CV upload** — PDFs, DOCX, images, text, and LinkedIn PDF exports.
- **Multi-template** — Classic, Modern, Compact, Two-Column.
- **PDF + DOCX export** — choose either format.
- **Auto-save** — persists in `localStorage`.

## Setup

```bash
npm install
cp .env.example .env       # paste your Anthropic key
npm run dev
```

Open <http://localhost:5173>. Get an API key at <https://console.claude.com> (free $5
credit on signup; this app uses fractions of a cent per request).

## LinkedIn

Export your profile from LinkedIn as a PDF (Profile → More → Save to PDF) and drop
it into the Upload CV button. It parses the same way as a résumé.

## A note on the honesty slider

- **100 (Verbatim):** AI cannot change a single word. Safe but defeats the purpose.
- **75 (Faithful — DEFAULT):** Rewords and reframes to match the JD, surfaces keywords, but does NOT invent facts, metrics, or technologies.
- **50 (Balanced):** May add reasonable inferences from context.
- **25 (Liberal):** Aggressively rewrites; may add plausible accomplishments.
- **0 (Aggressive):** Will fabricate. Visible red warning. **Don't ship anything you can't defend in an interview.**

## Project structure

```
src/
  components/
    App.jsx              # tab shell + top bar
    Builder.jsx          # main résumé editor
    Preview.jsx          # printable preview
    JobMatcher.jsx       # paste JD → pick or full-tailor
    CoverLetterTab.jsx   # cover letter generator/editor
    HonestySlider.jsx    # the slider
    Sortable.jsx         # dnd-kit wrapper
  lib/
    api.js               # proxy client
    parse.js             # JSON extraction + CV mapper
    storage.js           # localStorage
    honesty.js           # slider → prompt fragments
    templates.js         # layouts
    docxExport.js        # DOCX generation
    util.js, constants.js
  data/
    defaultResume.js     # seed content + Résumé Forge as a project
server/index.js          # Express proxy (API key never reaches browser)
```

## License

MIT.

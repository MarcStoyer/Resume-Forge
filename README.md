# Résumé Forge

Local-first résumé builder with reviewable AI tailoring, saved applications, and PDF/DOCX export.

## What's new in 1.3

- **Saved Applications library** — bookmark any {résumé + cover letter + JD} combo and click <b>Load</b> to use it as a starting point. Includes Import/Export JSON for backup.
- **Reviewable rewrites** — when AI suggests changes, each one comes as a checkbox you can toggle and an editable text field. Apply only what you want.
- **Whole-job removal** — AI can now mark unfit jobs/schools for full removal (not just clear their bullets). You see the keep/remove decision per entry and can flip any of them before applying.
- **First-person formal voice** — summary and cover letter prompts now require first person, no contractions.
- **Background CV parsing** — uploads continue while you switch tabs; no more wasted tokens from re-uploading.
- **Awards & Honors section** by default.
- **Custom sections** — add Publications, Languages, Volunteer, etc. via the "+ Add a custom section" button.
- **Renameable sections** (the ✎ icon).

## Setup

```bash
npm install
cp .env.example .env       # paste your Anthropic key
npm run dev
```

Open <http://localhost:5173>.

## License

MIT.

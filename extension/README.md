# Résumé Forge Job Tracker (Firefox / Zen)

Detects a job posting, scrapes the fields, and logs it straight to your Résumé
Forge tracker — keeping the full job description, which is what interview prep
later reasons over.

## How it decides what to capture

Primary source is **schema.org `JobPosting` JSON-LD**, which most boards embed
for Google's job search — Greenhouse, Lever, Ashby, Indeed, LinkedIn,
SmartRecruiters, Workable. That gives title, employer, salary and posting date
as structured data instead of scraped text, so it doesn't break every time a
site reskins. Pages without it (Workday, mostly) fall back to a deliberately
conservative `og:`/title parse that leaves fields blank rather than guessing.

Nothing is written until you press something. Viewing a posting is not applying
to one, and a tracker full of jobs you merely browsed is worse than no tracker.

## Two ways to log

- **In-page pill** — bottom-right on a recognised posting: `★ Save` and
  `✓ Applied`. Where you're already looking, so you don't have to remember the
  toolbar exists.
- **Toolbar popup** — always available, and the place to correct fields before
  committing. The reliable path when a page's layout fights the pill.

Revisit a posting you've already tracked and both show its current status
instead of offering to add it again — deduped on a canonicalised job URL
(tracking parameters stripped, so one posting is one URL).

## Install for development

```bash
cd extension
npm install
npm run dev          # launches a scratch Firefox with the extension loaded
```

Or load it by hand: `about:debugging` → This Firefox → Load Temporary Add-on →
pick `manifest.json`. **Temporary add-ons vanish when the browser restarts** —
fine for trying it, annoying daily. For permanent installation, sign it.

## Signing it so it installs permanently

Release Firefox (and Zen) refuse unsigned extensions. Signing is free and
doesn't mean publishing — `--channel=unlisted` gives you a signed `.xpi` that
never appears in the public directory.

1. Sign in at https://addons.mozilla.org and go to
   **Tools → Manage API Keys** (`/developers/addon/api/key/`).
2. Generate credentials. You get a **JWT issuer** and a **JWT secret**.
3. Export them and sign:

```bash
export AMO_JWT_ISSUER='user:12345678:123'
export AMO_JWT_SECRET='your-secret'
npm run sign
```

The signed `.xpi` lands in `web-ext-artifacts/`. Open it in Firefox/Zen (or
drag it onto the window) and it installs permanently.

Keep those credentials out of the repo — they're account credentials, not
config. Environment variables only.

### If signing is refused

`web-ext sign` runs Mozilla's automated validation. The usual causes are a
missing `browser_specific_settings.gecko.id` (present here) or a version that
was already uploaded — bump `version` in `manifest.json` and retry.

## What it can't do

- **Detect that you actually submitted.** No reliable universal signal exists,
  which is why this is one click rather than zero.
- **Capture a résumé you didn't upload on the page.** LinkedIn Easy Apply and
  Workday reuse a résumé already on file; no file touches the page, so there is
  nothing to capture. Attach it in the app afterwards.

## Permissions, and why

- `storage` — keeps your session so you aren't signing in every time.
- `activeTab`, `tabs` — knowing which tab's posting the popup is talking about.
- Host permissions are a **fixed list of job boards**, not `<all_urls>`. Other
  sites are opt-in via `optional_host_permissions`.

Your Supabase **anon** key is in `src/lib/config.js`. That is not a secret — it
already ships inside the public web app's bundle and grants nothing on its own.
Row Level Security is what protects the data: every row is gated on
`user_id = auth.uid()`, so the key is useful only once you've signed in as
yourself.

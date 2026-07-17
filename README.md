# Résumé Forge

[![Production](https://img.shields.io/badge/production-live-16a34a?style=flat-square)](https://resume-forge-self.vercel.app)
[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://resume-forge-self.vercel.app)
[![React](https://img.shields.io/badge/React-18-149eca?style=flat-square&logo=react)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-57534e?style=flat-square)](LICENSE)

An AI-assisted résumé workspace built by [Marc Stoyer](https://www.linkedin.com/in/marc-stoyer). Résumé Forge combines private cloud synchronization, reviewable AI tailoring, application tracking, and polished PDF/DOCX export.

**[Open the live application →](https://resume-forge-self.vercel.app)**

## Highlights

- Import PDF, DOCX, image, or text résumés, including organizational two-column CV layouts
- Tailor bullets and cover letters against a job description while keeping every change reviewable
- Track saved and submitted applications with status history
- Synchronize each account privately with Supabase Auth, Postgres, and Row Level Security
- Export professional PDF and DOCX documents from multiple layouts
- Start with Marc Stoyer's complete CV as an editable example

New accounts receive an independent copy of the starter CV. Their edits and application history are stored under their own Supabase user ID and are not shared with other accounts.

## Architecture

- React 18, Vite, and Tailwind CSS
- Supabase Postgres and Auth
- Vercel static hosting and Node.js Functions
- Anthropic API calls proxied through `/api/claude` so the API key never enters the
  browser

## Local setup

Use Node.js 22.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run `SUPABASE_PHASE_1.sql` and then `SUPABASE_PHASE_2.sql` in the Supabase SQL
Editor. The second script enables Row Level Security.

For the complete app, including the two API functions:

```bash
npx vercel dev
```

`npm run dev` starts Vite only and is suitable for frontend-only work; AI and URL
fetching require `vercel dev`.

## Deploy to Vercel

The production Vercel project is connected to this repository. Pushes to main
deploy to production automatically; other branches can create preview deployments.

### 1. Prepare Supabase

1. Create a Supabase project and run both SQL files in order.
2. Under Authentication → Sign In / Providers, enable Email.
3. Keep new-user signup enabled for a public deployment so visitors can create
   their own private workspace.
4. Copy the Project URL and anon/public key from the Supabase API settings.
5. Do not use or expose the Supabase service-role key. This application does not
   need it; the anon key, authenticated session, and RLS policies are sufficient.

### 2. Install and authenticate the Vercel CLI

```bash
npm install --global vercel
vercel login
```

You can also use `npx vercel` without installing the CLI globally.

### 3. Link the project

From this repository's root directory:

```bash
vercel link
```

Choose your personal Vercel account, create a new project when prompted, and keep
this repository root as the project root. Vercel should detect the Vite framework.

### 4. Add environment variables

Add the three variables to Production:

```bash
vercel env add ANTHROPIC_API_KEY production
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

Enter each value only when the CLI prompts for it. Do not place the Anthropic key in
any variable whose name starts with `VITE_`; Vite exposes such variables to browser
code.

If you plan to use Vercel preview deployments, add the same variables to Preview:

```bash
vercel env add ANTHROPIC_API_KEY preview
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview
```

Development variables may remain in your ignored `.env` file. Alternatively, add
them to Vercel's Development environment and use `vercel env pull`.

### 5. Create a preview deployment

```bash
vercel
```

Open the generated `https://...vercel.app` URL and check that the login page loads.
Do not expect the magic link to return correctly until the URL is allowed by
Supabase in the next step.

### 6. Configure Supabase authentication URLs

In Supabase, open Authentication → URL Configuration:

1. Set Site URL to your final production Vercel URL, for example
   `https://resume-forge.vercel.app`.
2. Add that exact production URL to Redirect URLs.
3. Keep `http://localhost:3000/**` for `vercel dev`.
4. If you will test preview deployments, add Vercel's recommended preview pattern:
   `https://*-YOUR-VERCEL-ACCOUNT-SLUG.vercel.app/**`.

The application sends magic links back to the origin where login began, so every
origin you use must be permitted by Supabase. Prefer an exact URL for production;
use a wildcard only for previews.

### 7. Deploy production

```bash
vercel --prod
```

Open the production URL and verify:

1. A magic link signs you in and returns to the production domain.
2. Editing data creates or updates a `user_data` row keyed by your Auth user UUID.
3. Reloading restores the saved data.
4. Logging out hides the résumé UI.
5. An Anthropic-backed action reaches `/api/claude` successfully.
6. Fetching a public job URL reaches `/api/fetch-url`.
7. `ANTHROPIC_API_KEY` is absent from browser source and request payloads.

For a public deployment, leave “Allow new users to sign up” enabled. For a private
single-user deployment, disable it after your first account works. In either mode,
Row Level Security remains the primary data security boundary.

## Free-tier considerations

These quotas change over time, so check the provider dashboards before relying on
specific numbers.

### Vercel Hobby

- Intended for personal/non-commercial projects.
- Currently includes 1 million function invocations, 100 GB fast data transfer,
  4 CPU-hours, and 360 GB-hours of provisioned function memory per billing period.
- Hobby usage does not automatically become a paid overage; projects may be paused
  after exceeding included usage.
- Runtime logs are retained for only one hour.
- Function request and response bodies are limited to 4.5 MB. Because uploaded
  résumé files are base64-encoded before reaching `/api/claude`, larger PDFs or
  images can fail with HTTP 413.

For a personal portfolio or lightly used public résumé builder, normal usage should
be far below these limits. AI requests that wait on Anthropic consume function
duration, so avoid repeatedly submitting unnecessarily large documents.

### Supabase Free

- Two active free projects.
- 500 MB database size per project; a free project can enter read-only mode after
  exceeding that database quota.
- 50,000 monthly active users, 5 GB egress, and 1 GB file storage are included.
- Free projects with low activity may be paused after about seven days. Restore a
  paused project from the Supabase dashboard before trying to sign in.
- Free projects do not include automatic database backups. Periodically export the
  `user_data` row or keep a separate résumé backup.
- Supabase's default email sender is rate-limited. For one user this is normally
  adequate, but avoid repeatedly requesting magic links.

### Anthropic API

Anthropic API usage is separate from the Vercel and Supabase free tiers and can
incur token charges. Create a dedicated Anthropic Console workspace and API key for
Résumé Forge, then open that workspace's Limits tab and set a low Workspace Spend
Limit. A small monthly cap appropriate to your expected usage provides a safety net
if the key is abused or a client accidentally makes repeated requests. Also monitor
usage in the Anthropic Console and immediately disable/rotate the key if it is ever
exposed.

## Security notes

- Never commit `.env`, `.env.local`, or service-role/API secrets.
- `VITE_SUPABASE_ANON_KEY` is intentionally browser-visible and is safe only when
  RLS remains enabled and correctly configured.
- Keep `ANTHROPIC_API_KEY` server-side and unprefixed by `VITE_`.
- The URL-fetch function is best-effort; many job boards block automated requests.

## Provider documentation

- [Vercel CLI](https://vercel.com/docs/cli)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel limits](https://vercel.com/docs/limits)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase billing and free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase free-project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Anthropic Console workspaces and spend limits](https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces-in-the-claude-console)

## License

MIT.

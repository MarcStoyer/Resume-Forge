PHASE 1 - SUPABASE STORAGE MIGRATION

What changed

- Added @supabase/supabase-js.
- Added src/lib/supabase.js. It reads VITE_SUPABASE_URL and
  VITE_SUPABASE_ANON_KEY from Vite environment variables.
- Replaced localStorage persistence in src/lib/storage.js with reads and writes to
  the Supabase user_data table.
- Phase 1 uses the temporary user_id value "default-user". Authentication and Row
  Level Security will be added in Phase 2.
- Added Supabase storage functions for job_url and paper, which were previously
  written directly to localStorage by App.jsx.
- Updated App.jsx to load Supabase data asynchronously before rendering the app.
  Save effects do not run until the initial load finishes, preventing defaults from
  overwriting remote data.
- Added a loading screen and visible storage error messages.
- Added SUPABASE_PHASE_1.sql with the table creation SQL.
- Added .env.example with the required environment variables.
- The Express server and Anthropic proxy endpoints are unchanged in this phase.

How to test

1. Create a Supabase project.

2. Open the Supabase SQL Editor and run the contents of SUPABASE_PHASE_1.sql.
   Row Level Security must remain disabled for this temporary unauthenticated phase.

3. Copy .env.example to .env if you do not already have a .env file.

4. Set these values in .env:

   ANTHROPIC_API_KEY=your existing Anthropic API key
   VITE_SUPABASE_URL=your Supabase project URL
   VITE_SUPABASE_ANON_KEY=your Supabase anon/public key

5. Install dependencies:

   npm install

6. Start the app:

   npm run dev

7. Verify the app passes the loading screen and renders normally.

8. Edit the resume, cover letter, job description, job URL, template, honesty
   setting, paper size, and applications. Wait at least one second after edits.

9. In Supabase Table Editor, open public.user_data and verify there is one row with
   user_id "default-user" and that its columns update.

10. Reload the browser and verify the saved values load again.

Notes

- Existing localStorage data is not automatically imported. The app now ignores and
  stops writing the migrated localStorage keys.
- Do not enable Row Level Security yet. With no login token, Phase 1 browser requests
  would be rejected after RLS is enabled.
- The current installed Vite version and latest Supabase client report that they
  expect a newer Node.js release than Node 18. Use Node 22 for local development if
  npm prints engine warnings.

PHASE 2 - SUPABASE AUTH AND ROW LEVEL SECURITY

What changed

- Added an AuthProvider that restores the Supabase session and listens for auth
  changes.
- Added an authentication gate. The resume app is not mounted until a user is
  signed in.
- Added an email magic-link login screen. No password is collected or stored.
- Replaced the temporary "default-user" storage key with the authenticated Supabase
  user UUID on every database read and write.
- Added the signed-in email and a Log out button to the existing top bar.
- Added SUPABASE_PHASE_2.sql to enable Row Level Security and restrict every
  user_data row to its matching authenticated user.

How to test Phase 2

1. In Supabase, open Authentication > Providers > Email and make sure Email is
   enabled. Magic-link sign-in works with the default email provider settings.

2. In Authentication > URL Configuration, set Site URL to the local URL printed by
   Vite (normally http://localhost:5173). Add that same URL to Redirect URLs.

3. Run SUPABASE_PHASE_2.sql in the Supabase SQL Editor. This enables RLS, so do not
   run it until the Phase 2 frontend code is in place.

4. Start the app with Node 22 or newer:

   npm run dev

5. Verify the login screen appears instead of the resume builder.

6. Enter your email and open the magic link on the same device. You should return to
   the app already signed in.

7. Edit several fields and verify public.user_data contains a row whose user_id is
   your Authentication user UUID. The old "default-user" row is no longer used.

8. Reload the browser and verify your session and data are restored.

9. Click Log out and verify the login screen returns and resume data is no longer
   visible.

10. Optional RLS check: sign in with a second email address and confirm it receives a
    separate row and cannot read the first account's data.

Notes

- Magic links return to window.location.origin. Add every development or deployed
  origin you use to Supabase Authentication Redirect URLs.
- The Phase 1 "default-user" row is left in place but becomes inaccessible through
  the browser once RLS is enabled. It may be deleted later after confirming the
  authenticated row contains the data you want.

PHASE 3 - VERCEL SERVERLESS FUNCTIONS

What changed

- Replaced the Express POST /api/claude route with api/claude.js, a Vercel Node.js
  function that keeps ANTHROPIC_API_KEY server-side and forwards the request to the
  Anthropic Messages API.
- Replaced the Express POST /api/fetch-url route with api/fetch-url.js, preserving
  the existing best-effort job-posting fetch and text extraction behavior.
- Both functions reject non-POST requests with HTTP 405.
- Added basic URL validation to fetch-url so it accepts only HTTP and HTTPS URLs.
- Removed server/index.js and the Express static server.
- Removed express, concurrently, and dotenv from package.json and package-lock.json.
- Simplified npm run dev to start Vite only.
- Pinned the project runtime to Node 22.x for Vercel, matching the current Vite and
  Supabase client requirements.
- Added vercel.json with Vite framework detection and a 60-second maximum duration
  for the API functions.
- Frontend calls remain /api/claude and /api/fetch-url, so no UI code changed in
  this phase.

How to test Phase 3 locally

1. Use Node 22 or newer and install dependencies:

   npm install

2. Make sure the project-root .env or .env.local contains:

   ANTHROPIC_API_KEY=your Anthropic API key
   VITE_SUPABASE_URL=your Supabase project URL
   VITE_SUPABASE_ANON_KEY=your Supabase anon/public key

3. Start the complete Vercel environment from the project root:

   npx vercel dev

4. The first run may ask you to log in and link or create a Vercel project. Complete
   those prompts. This is only for local testing; do not run a production deployment
   yet.

5. Open the local URL printed by Vercel, normally http://localhost:3000.

6. Sign in through the Supabase magic link. Add the Vercel local origin to Supabase
   Authentication Redirect URLs if it differs from the Vite URL used in Phase 2.

7. Exercise an Anthropic-backed action, such as generating a cover letter or parsing
   a small resume file. Verify /api/claude returns successfully and that the API key
   never appears in browser source or network request bodies.

8. Paste a public job-posting URL and use the fetch action. Verify
   /api/fetch-url returns extracted text or the existing best-effort error message.

9. Verify direct GET requests to either API route return HTTP 405.

Important local-development behavior

- npm run dev now runs only Vite. It is useful for frontend-only work, but the two
  /api routes will not be available there.
- Use npx vercel dev whenever testing AI actions or URL fetching.
- Vercel Functions currently impose a 4.5 MB request-body limit. Because resume PDFs
  and images are base64-encoded before being sent to /api/claude, large files can
  return HTTP 413 on Vercel even though the old Express server allowed 25 MB. Test
  uploads with small files; supporting larger uploads would require a separate
  direct-upload/storage design outside this migration phase.

PHASE 4 - VERCEL DEPLOYMENT GUIDE

What changed

- Reworked README.md to describe the current Supabase/Vercel architecture and the
  Node 22 requirement.
- Added complete local setup instructions using npx vercel dev.
- Added step-by-step Vercel CLI instructions for login, project linking, environment
  variables, preview deployment, and production deployment.
- Documented that no Supabase service-role/server key is needed. Browser database
  access uses the anon key, authenticated sessions, and RLS.
- Added the required production and preview redirect URL configuration for Supabase
  magic links.
- Added a single-user hardening step: after the owner's first login succeeds,
  disable new-user signups in Supabase.
- Added a production verification checklist covering auth, persistence, logout, both
  serverless endpoints, and secret exposure.
- Added current Vercel Hobby and Supabase Free quota considerations and operational
  caveats.
- Added a recommendation to create a dedicated Anthropic workspace/key and configure
  a low Workspace Spend Limit as a safety cap.

Deployment command summary

1. Install and log in:

   npm install --global vercel
   vercel login

2. Link the repository:

   vercel link

3. Add Production environment variables:

   vercel env add ANTHROPIC_API_KEY production
   vercel env add VITE_SUPABASE_URL production
   vercel env add VITE_SUPABASE_ANON_KEY production

4. Create a preview deployment:

   vercel

5. Add the resulting production/preview origins to Supabase Authentication URL
   Configuration as explained in README.md.

6. Deploy production:

   vercel --prod

No external deployment was performed by Codex. Linking accounts, entering secrets,
and creating the production deployment remain explicit owner actions.

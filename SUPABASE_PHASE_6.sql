-- PHASE 6 — Model selection
--
-- Adds the per-user model choice behind the AI settings popover (which model
-- handles parsing vs. writing). Run in the Supabase SQL Editor after Phase 1-5.
--
-- Run this before (or immediately after) deploying. It was originally
-- described as non-blocking, which was wrong: the data load named its columns
-- explicitly, so a missing one failed the entire load with
-- "column user_data.ai_settings does not exist" and the app could read nothing.
--
-- storage.js now selects "*", so a not-yet-migrated column is merely absent
-- from the result and falls back to DEFAULT_AI_SETTINGS (src/lib/models.js).
-- With that fix in place this really is non-blocking — until it is run, the
-- model choice just won't persist between sessions.

alter table public.user_data
  add column if not exists ai_settings jsonb;

-- Shape: {"extraction": "<model id>", "writing": "<model id>"}
--
-- extraction: CV parsing and cleaning up fetched job postings.
-- writing:    tailoring, cover letters, summaries, interview prep.
--
-- Unknown/retired model ids are ignored at load (see setActiveModels in
-- src/lib/api.js) and fall back to the default, so an id that stops existing
-- degrades instead of 400ing every request.

-- PHASE 6 — Model selection
--
-- Adds the per-user model choice behind the AI settings popover (which model
-- handles parsing vs. writing). Run in the Supabase SQL Editor after Phase 1-5.
--
-- Not blocking: the app merges whatever it finds over DEFAULT_AI_SETTINGS
-- (src/lib/models.js), so a null column simply means "use the defaults" and
-- deploying before running this degrades to the default model rather than
-- breaking. Run it before you want the setting to persist across sessions.

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

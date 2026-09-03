-- PHASE 4 — Interview prep settings
--
-- Adds one per-user settings column used by the Interview Prep feature's
-- gear-icon popover (trigger point, and which content to include/how deep).
-- Run this in the Supabase SQL Editor after Phase 1, Phase 2, and Phase 3.

alter table public.user_data
  add column if not exists interview_prep_settings jsonb;

-- interview_prep_settings: null until a user opens the settings popover, at
-- which point the app writes a full object. The app always merges stored
-- values over DEFAULT_INTERVIEW_PREP_SETTINGS (src/lib/interviewPrep.js), so
-- a null/partial value here is safe and just falls back to the defaults:
--   { "trigger": "applied", "reasoning": true, "examples": true,
--     "answers": true, "depth": "standard" }
--
-- trigger: "applied" fires auto-generate at save/mark-applied time (the
--   original behavior, matching interview_prep_auto's existing description);
--   "interview" instead waits until the application's status is moved to the
--   Interview stage.
-- reasoning / examples / answers: booleans gating whether generated prep
--   includes a "why likely" line, cited evidence, and answer outlines
--   (STAR outline + missing-evidence flag + suggestion), respectively.
-- depth: "quick" | "standard" | "deep" — question count and level of detail
--   requested from the model (see the DEPTH table in src/lib/interviewPrep.js).

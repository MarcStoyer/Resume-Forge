-- PHASE 3 — Interview prep settings
--
-- Adds two per-user settings columns used by the Interview Prep feature.
-- Run this in the Supabase SQL Editor after Phase 1 and Phase 2.

alter table public.user_data
  add column if not exists interview_prep_auto boolean not null default false,
  add column if not exists interview_honesty int not null default 75;

-- interview_prep_auto: when true, saving or marking an application "Applied"
-- automatically generates interview prep for it (costs an API call). Defaults
-- to false so existing and new accounts don't spend AI credits until you opt in.
--
-- interview_honesty: 0-100, same scale as the résumé honesty slider. Controls
-- how freely interview-prep answer suggestions may go beyond verified evidence
-- (see src/lib/honesty.js -> honestyPromptForInterview). Defaults to 75
-- ("Faithful"), matching the résumé slider's default.

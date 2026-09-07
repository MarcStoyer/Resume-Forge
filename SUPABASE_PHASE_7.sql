-- PHASE 7 — Applications get their own table
--
-- Until now every application lived inside a single `applications` jsonb array
-- on user_data. That shape has three problems the browser extension makes
-- unavoidable:
--
--   1. Appending is read-modify-write. Two writers (a Résumé Forge tab
--      autosaving, and the extension logging a job) clobber each other.
--   2. "Is this job already tracked?" means scanning the whole array client
--      side, when the extension needs it as an indexed lookup by job URL.
--   3. Editing one field rewrites every application on every keystroke.
--
-- This moves them to one row per application. Run in the Supabase SQL Editor
-- after Phase 1-6.
--
-- SAFE TO RUN: user_data.applications is left completely untouched as a
-- backup. Nothing is dropped. If anything looks wrong afterwards the old array
-- is still sitting there, and the app falls back to reading it when this table
-- is absent.

create table if not exists public.applications (
  id              text primary key,
  user_id         text not null,
  label           text not null default 'Untitled',
  company         text not null default '',
  role            text not null default '',
  source          text not null default '',
  salary          text not null default '',
  status          text not null default 'saved',
  status_history  jsonb not null default '[]'::jsonb,
  saved_at        timestamptz not null default now(),
  jd              text not null default '',
  job_url         text not null default '',
  resume_url      text not null default '',
  cover_letter    text not null default '',
  notes           text not null default '',
  resume          jsonb,
  interview_prep  jsonb,
  template_id     text,
  honesty         int,
  origin          text not null default 'manual',
  updated_at      timestamptz not null default now()
);

-- Listing is always "my applications, newest first".
create index if not exists applications_user_saved_idx
  on public.applications (user_id, saved_at desc);

-- The extension's dedupe question — "have I already tracked this posting?" —
-- as an index lookup rather than a client-side scan.
create index if not exists applications_user_job_url_idx
  on public.applications (user_id, job_url)
  where job_url <> '';

alter table public.applications enable row level security;

revoke all on table public.applications from anon;
grant select, insert, update, delete on public.applications to authenticated;

drop policy if exists "Users can manage their own applications" on public.applications;
create policy "Users can manage their own applications"
on public.applications
for all
to authenticated
using (user_id = (select auth.uid())::text)
with check (user_id = (select auth.uid())::text);

-- Backfill from the existing jsonb array. `on conflict do nothing` makes this
-- safe to run more than once — re-running will not duplicate anything.
--
-- savedAt is epoch milliseconds in the old shape; the regex guard keeps a
-- malformed value from failing the whole insert.
insert into public.applications (
  id, user_id, label, company, role, source, status, status_history,
  saved_at, jd, job_url, resume_url, cover_letter, notes,
  resume, interview_prep, template_id, honesty, origin
)
select
  coalesce(nullif(a->>'id', ''), gen_random_uuid()::text),
  u.user_id,
  coalesce(nullif(a->>'label', ''), 'Untitled'),
  coalesce(a->>'company', ''),
  coalesce(a->>'role', ''),
  coalesce(a->>'source', ''),
  coalesce(nullif(a->>'status', ''), 'saved'),
  case when jsonb_typeof(a->'statusHistory') = 'array'
       then a->'statusHistory' else '[]'::jsonb end,
  case when (a->>'savedAt') ~ '^[0-9]+$'
       then to_timestamp((a->>'savedAt')::bigint / 1000.0)
       else now() end,
  coalesce(a->>'jd', ''),
  coalesce(a->>'jobUrl', ''),
  coalesce(a->>'resumeUrl', ''),
  coalesce(a->>'coverLetter', ''),
  coalesce(a->>'notes', ''),
  case when jsonb_typeof(a->'resume') = 'object' then a->'resume' end,
  case when jsonb_typeof(a->'interviewPrep') = 'object' then a->'interviewPrep' end,
  a->>'templateId',
  case when (a->>'honesty') ~ '^[0-9]+$' then (a->>'honesty')::int end,
  coalesce(nullif(a->>'origin', ''), 'manual')
from public.user_data u,
     lateral jsonb_array_elements(coalesce(u.applications, '[]'::jsonb)) a
on conflict (id) do nothing;

-- Check the backfill before trusting it. These two should match:
--   select count(*) from public.applications;
--   select sum(jsonb_array_length(coalesce(applications, '[]'::jsonb))) from public.user_data;

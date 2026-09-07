-- ===========================================================================
--  RUN THIS WHOLE FILE IN THE SUPABASE SQL EDITOR.
--
--  Select all (Ctrl+A), copy, paste into the editor, press Run.
--
--  What it does: your job applications currently live as one big blob in a
--  single database cell. This creates a proper table with one row per
--  application, and copies your existing ones into it.
--
--  It is safe:
--    - Nothing is deleted. Your existing data is only read from.
--    - Safe to run more than once; it will not create duplicates.
--
--  The last statement prints two numbers. THEY SHOULD MATCH — that is how you
--  know every application made it across. Tell Claude the two numbers.
-- ===========================================================================

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


-- ===========================================================================
--  CHECK YOUR WORK — these two numbers should be the same.
-- ===========================================================================
select
  (select count(*) from public.applications)
    as applications_in_new_table,
  (select coalesce(sum(jsonb_array_length(coalesce(applications, '[]'::jsonb))), 0)
     from public.user_data)
    as applications_in_old_blob;

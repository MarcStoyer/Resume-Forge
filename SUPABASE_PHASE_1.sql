create table if not exists public.user_data (
  user_id text primary key,
  resume jsonb,
  template text,
  honesty int,
  cover_letter text,
  jd text,
  job_url text,
  paper text,
  applications jsonb,
  updated_at timestamp default now()
);

-- Phase 1 intentionally leaves Row Level Security disabled.
-- Phase 2 will replace the placeholder user id with auth.uid() and add RLS policies.

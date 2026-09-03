-- PHASE 5 — Per-user rate limiting for the API proxies
--
-- Backs the basic rate limiting added to api/claude.js and api/fetch-url.js
-- (api/_lib/rateLimit.js). Run this in the Supabase SQL Editor after Phase
-- 1-4. Unlike prior phases, this one is NOT blocking: both endpoints fail
-- OPEN if this table/function don't exist yet (see rateLimit.js), so
-- deploying before running this migration degrades gracefully to
-- "no rate limiting yet" rather than breaking the app. Still, run it before
-- sending public traffic — rate limiting is one of the two protections
-- (along with authentication) that make these endpoints safe to expose.

create table if not exists public.rate_limits (
  user_id text not null,
  endpoint text not null,
  window_start timestamptz not null default now(),
  count int not null default 0,
  primary key (user_id, endpoint)
);

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from anon;
grant select, insert, update on table public.rate_limits to authenticated;

drop policy if exists "Users can manage their own rate limit rows" on public.rate_limits;
create policy "Users can manage their own rate limit rows"
on public.rate_limits
for all
to authenticated
using (user_id = (select auth.uid())::text)
with check (user_id = (select auth.uid())::text);

-- Atomic fixed-window counter: one upsert per call, so concurrent requests
-- from the same user can't race each other into under-counting. Runs as
-- the calling user (security invoker, the default) — RLS above is what
-- lets it touch that user's own row and nobody else's. Returns true if
-- this request is within p_limit for the current p_window_seconds window,
-- false once the window's count exceeds it (the window then resets on the
-- next call after it has elapsed).
create or replace function public.check_rate_limit(p_endpoint text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_user_id text := (select auth.uid())::text;
  v_count int;
begin
  if v_user_id is null then
    return false;
  end if;

  insert into public.rate_limits as rl (user_id, endpoint, window_start, count)
  values (v_user_id, p_endpoint, now(), 1)
  on conflict (user_id, endpoint) do update
    set count = case
                   when rl.window_start < now() - make_interval(secs => p_window_seconds)
                   then 1
                   else rl.count + 1
                 end,
        window_start = case
                   when rl.window_start < now() - make_interval(secs => p_window_seconds)
                   then now()
                   else rl.window_start
                 end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Two separate default grants both need revoking, or an unauthenticated
-- caller can invoke this too (harmless if they do — auth.uid() is null for
-- them, so the function returns false before touching any data, and RLS on
-- the table is a second backstop — but it shouldn't be reachable at all):
-- Postgres itself grants EXECUTE on every new function to PUBLIC by
-- default, and Supabase additionally auto-grants EXECUTE on every new
-- public-schema function directly to `anon` (a platform default, layered
-- on top of and independent from Postgres's own PUBLIC default — revoking
-- from PUBLIC alone does not remove this one).
revoke execute on function public.check_rate_limit(text, int, int) from public;
revoke execute on function public.check_rate_limit(text, int, int) from anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- Current limits (api/claude.js, api/fetch-url.js): 20 requests per 60
-- seconds, per user, per endpoint. Generous enough for normal interactive
-- use (regenerating a few times in a row) while blocking a scripted loop.

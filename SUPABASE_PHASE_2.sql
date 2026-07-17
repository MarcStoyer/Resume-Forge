alter table public.user_data enable row level security;

revoke all on table public.user_data from anon;
grant select, insert, update, delete on table public.user_data to authenticated;

drop policy if exists "Users can manage their own data" on public.user_data;

create policy "Users can manage their own data"
on public.user_data
for all
to authenticated
using (user_id = (select auth.uid())::text)
with check (user_id = (select auth.uid())::text);

-- The Phase 1 "default-user" row is intentionally not accessible after RLS is
-- enabled. After signing in, the app creates a row keyed by your Auth user UUID.

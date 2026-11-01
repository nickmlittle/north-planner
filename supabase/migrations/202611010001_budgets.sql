create table if not exists public.budgets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision integer not null default 1 check (revision > 0)
);

alter table public.budgets enable row level security;

create policy "Users can read their own budget" on public.budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own budget" on public.budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own budget" on public.budgets
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.budgets to authenticated;

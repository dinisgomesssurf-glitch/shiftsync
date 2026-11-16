-- "My usual week": availability a person sets once, which repeats every week.
-- Rows in public.availability for a specific week_start override it for that week.
-- A row with start_time = end_time = '00:00' means "any time that day".
create table if not exists public.availability_default (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  created_at timestamptz not null default now()
);
alter table public.availability_default enable row level security;
create policy "Usual week: team reads" on public.availability_default for select using (public.is_org_member(organization_id));
create policy "Usual week: own write" on public.availability_default for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));
create index if not exists availability_default_org_user_idx on public.availability_default (organization_id, user_id);

-- Until someone sets availability, count them as free any time (per business).
alter table public.organizations add column if not exists assume_available boolean not null default true;

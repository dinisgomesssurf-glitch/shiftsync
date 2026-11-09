-- ShiftSync v2 — Phase 2: shift templates + generation settings
-- Templates are the default way a business describes demand:
-- "Opening, Mon, 08:30–14:00, barista, min 1, target 2".
-- Existing staffing_requirements are carried over (min = target = min_workers);
-- the old table stays for now but the app no longer uses it.

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  name text not null default 'Shift' check (char_length(name) between 1 and 60),
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  role_id uuid references public.job_roles(id) on delete set null,
  min_workers int not null default 1 check (min_workers >= 0),
  target_workers int not null default 1,
  break_minutes int not null default 0 check (break_minutes >= 0),
  kind text not null default 'regular' check (kind in ('regular','trial','event')),
  created_at timestamptz not null default now(),
  check (target_workers >= min_workers),
  check (start_time <> end_time)
);
alter table public.shift_templates enable row level security;
create policy "Templates: members read" on public.shift_templates for select using (public.is_org_member(organization_id));
create policy "Templates: admins write" on public.shift_templates for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create index if not exists shift_templates_org_idx on public.shift_templates (organization_id, weekday, start_time);

insert into public.shift_templates (organization_id, weekday, name, start_time, end_time, min_workers, target_workers)
select organization_id, day_index, coalesce(nullif(trim(label), ''), 'Shift'),
       left(start_time, 5), left(end_time, 5), greatest(min_workers, 0), greatest(min_workers, 0)
  from public.staffing_requirements
 where left(start_time, 5) <> left(end_time, 5)
   and not exists (select 1 from public.shift_templates t where t.organization_id = staffing_requirements.organization_id);

alter table public.organizations
  add column if not exists generation_preset text not null default 'balanced'
    check (generation_preset in ('balanced','cover_first','save_money')),
  add column if not exists labor_budget numeric(10,2) check (labor_budget >= 0);

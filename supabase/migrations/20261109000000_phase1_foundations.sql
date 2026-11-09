-- ShiftSync v2 — Phase 1: foundations
-- ---------------------------------------------------------------------------
-- 1. Real dates instead of week_offset ("weeks from today"), which silently
--    drifted onto the wrong week as time passed.
-- 2. Schedules cover a period (a week or an event), with a version for safe saves.
-- 3. New tables: rules, job roles, events, time off, member pay, schedule runs.
-- 4. save_schedule(): replaces a rota's shifts in ONE transaction, rejecting
--    stale versions, so a failed save can no longer leave a half-written rota.
-- 5. Fixes the day_settings unique key that let only one business save hours.
--
-- Backfill rule: week_offset was relative to the week the row was written in,
-- as seen by a browser in Lisbon. So week_start = Monday of created_at (Lisbon
-- time) + week_offset weeks. All existing rows were written 4–7 May 2026.
-- The legacy week_offset columns stay (nullable) for history; nothing new
-- reads them. Triggers fill the new columns if an old client still inserts.
-- ---------------------------------------------------------------------------

begin;

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.lisbon_monday(ts timestamptz)
returns date language sql immutable set search_path = public as $$
  select (date_trunc('week', ts at time zone 'Europe/Lisbon'))::date
$$;

-- ── Organizations: jurisdiction & settings ─────────────────────────────────
alter table public.organizations
  add column if not exists jurisdiction text not null default 'PT',
  add column if not exists timezone text not null default 'Europe/Lisbon',
  add column if not exists currency text not null default 'EUR',
  add column if not exists locale text not null default 'en',
  add column if not exists week_starts_on smallint not null default 0 check (week_starts_on between 0 and 6),
  add column if not exists staff_see_team boolean not null default true,
  add column if not exists min_staff_while_open smallint not null default 0 check (min_staff_while_open >= 0),
  add column if not exists rule_overrides jsonb not null default '{}'::jsonb,
  add column if not exists plan text not null default 'trial';

-- ── Members: employment details (pay lives in member_pay, admin-only) ─────
alter table public.organization_members
  add column if not exists contract_type text check (contract_type in ('full_time','part_time','casual','volunteer')),
  add column if not exists target_hours numeric(5,2) check (target_hours >= 0),
  add column if not exists max_hours numeric(5,2) check (max_hours >= 0),
  add column if not exists senior boolean not null default true,
  add column if not exists active boolean not null default true;

create table if not exists public.member_pay (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hourly_rate numeric(8,2) not null check (hourly_rate >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.member_pay enable row level security;
create policy "Pay: admins manage" on public.member_pay for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy "Pay: see own" on public.member_pay for select using (user_id = auth.uid());

-- ── Job roles ──────────────────────────────────────────────────────────────
create table if not exists public.job_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.job_roles enable row level security;
create policy "Job roles: members read" on public.job_roles for select using (public.is_org_member(organization_id));
create policy "Job roles: admins write" on public.job_roles for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create table if not exists public.member_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.job_roles(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (user_id, role_id)
);
alter table public.member_roles enable row level security;
create policy "Member roles: members read" on public.member_roles for select using (public.is_org_member(organization_id));
create policy "Member roles: admins write" on public.member_roles for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- ── Availability: week_start ───────────────────────────────────────────────
alter table public.availability add column if not exists week_start date;
update public.availability
   set week_start = public.lisbon_monday(coalesce(created_at, now())) + week_offset * 7
 where week_start is null;
alter table public.availability alter column week_offset drop not null;

create or replace function public.fill_week_start() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.week_start is null and new.week_offset is not null then
    new.week_start := public.lisbon_monday(now()) + new.week_offset * 7;
  end if;
  if new.week_start is null then
    raise exception 'week_start is required';
  end if;
  return new;
end $$;

drop trigger if exists availability_fill_week_start on public.availability;
create trigger availability_fill_week_start before insert or update on public.availability
  for each row execute function public.fill_week_start();
alter table public.availability alter column week_start set not null;
drop index if exists public.availability_org_user_week_day_slot_uq;
create unique index if not exists availability_org_user_weekstart_day_slot_uq
  on public.availability (organization_id, user_id, week_start, day_index, slot_index);
create index if not exists availability_org_weekstart_idx on public.availability (organization_id, week_start);

-- ── Personal events: week_start ────────────────────────────────────────────
alter table public.personal_events add column if not exists week_start date;
update public.personal_events
   set week_start = public.lisbon_monday(coalesce(created_at, now())) + week_offset * 7
 where week_start is null;
alter table public.personal_events alter column week_offset drop not null;
drop trigger if exists personal_events_fill_week_start on public.personal_events;
create trigger personal_events_fill_week_start before insert or update on public.personal_events
  for each row execute function public.fill_week_start();
alter table public.personal_events alter column week_start set not null;
create index if not exists personal_events_user_weekstart_idx on public.personal_events (user_id, week_start);

-- ── Events (one-off dated work, e.g. 22:00–04:00 parties) ──────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  venue text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  pay_rate numeric(8,2),
  budget numeric(10,2),
  status text not null default 'draft' check (status in ('draft','open','scheduled','done','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
alter table public.events enable row level security;
create policy "Events: members read" on public.events for select using (public.is_org_member(organization_id));
create policy "Events: admins write" on public.events for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create index if not exists events_org_start_idx on public.events (organization_id, start_at);

create table if not exists public.event_positions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  role_id uuid references public.job_roles(id) on delete set null,
  label text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  headcount_min int not null default 1 check (headcount_min >= 0),
  headcount_target int not null default 1 check (headcount_target >= headcount_min),
  check (end_at > start_at)
);
alter table public.event_positions enable row level security;
create policy "Event positions: members read" on public.event_positions for select
  using (exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id)));
create policy "Event positions: admins write" on public.event_positions for all
  using (exists (select 1 from public.events e where e.id = event_id and public.is_org_admin(e.organization_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and public.is_org_admin(e.organization_id)));

create table if not exists public.event_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('available','unavailable')),
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_responses enable row level security;
create policy "Event responses: members read" on public.event_responses for select
  using (exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id)));
create policy "Event responses: own write" on public.event_responses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id)));

-- ── Schedules: periods + version ───────────────────────────────────────────
alter table public.schedules
  add column if not exists kind text not null default 'week' check (kind in ('week','event')),
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists version int not null default 1,
  add column if not exists generated_at timestamptz;
update public.schedules
   set period_start = public.lisbon_monday(coalesce(created_at, now())) + week_offset * 7
 where period_start is null;
update public.schedules set period_end = period_start + 6 where period_end is null;
alter table public.schedules alter column week_offset drop not null;

create or replace function public.fill_schedule_period() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.period_start is null and new.week_offset is not null then
    new.period_start := public.lisbon_monday(now()) + new.week_offset * 7;
  end if;
  if new.period_start is null then
    raise exception 'period_start is required';
  end if;
  if new.period_end is null then
    new.period_end := new.period_start + 6;
  end if;
  if new.period_end < new.period_start then
    raise exception 'period_end must not be before period_start';
  end if;
  if new.kind = 'event' and new.event_id is null then
    raise exception 'event schedules need an event_id';
  end if;
  return new;
end $$;
drop trigger if exists schedules_fill_period on public.schedules;
create trigger schedules_fill_period before insert or update on public.schedules
  for each row execute function public.fill_schedule_period();
alter table public.schedules alter column period_start set not null;
alter table public.schedules alter column period_end set not null;

drop index if exists public.schedules_org_week_uq;
create unique index if not exists schedules_org_week_period_uq
  on public.schedules (organization_id, period_start) where kind = 'week';
create unique index if not exists schedules_event_uq on public.schedules (event_id) where kind = 'event';
create index if not exists schedules_org_period_idx on public.schedules (organization_id, period_start);

-- ── Shifts: real dates, open shifts, kinds, breaks ─────────────────────────
alter table public.shifts
  add column if not exists date date,
  add column if not exists kind text not null default 'regular' check (kind in ('regular','trial','event')),
  add column if not exists break_minutes int not null default 0 check (break_minutes >= 0),
  add column if not exists role_id uuid references public.job_roles(id) on delete set null,
  add column if not exists locked boolean not null default false;
update public.shifts sh
   set date = s.period_start + sh.day_index
  from public.schedules s
 where s.id = sh.schedule_id and sh.date is null;
alter table public.shifts alter column user_id drop not null; -- null = open shift

create or replace function public.fill_shift_date() returns trigger
language plpgsql set search_path = public as $$
declare ps date;
begin
  select period_start into ps from public.schedules where id = new.schedule_id;
  if new.date is null and new.day_index is not null then
    new.date := ps + new.day_index;
  end if;
  if new.day_index is null and new.date is not null then
    new.day_index := (new.date - ps);
  end if;
  if new.date is null then
    raise exception 'shift date is required';
  end if;
  return new;
end $$;
drop trigger if exists shifts_fill_date on public.shifts;
create trigger shifts_fill_date before insert or update on public.shifts
  for each row execute function public.fill_shift_date();
alter table public.shifts alter column date set not null;
-- day_index stays as a display helper for week views; events may span past 6.
alter table public.shifts drop constraint if exists shifts_day_index_check;
alter table public.shifts add constraint shifts_day_index_check check (day_index >= 0);
create index if not exists shifts_schedule_idx on public.shifts (schedule_id);
create index if not exists shifts_user_date_idx on public.shifts (user_id, date);

-- ── Time off ───────────────────────────────────────────────────────────────
create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
alter table public.time_off enable row level security;
create policy "Time off: own or admin read" on public.time_off for select
  using (user_id = auth.uid() or public.is_org_admin(organization_id));
create policy "Time off: request own" on public.time_off for insert
  with check (user_id = auth.uid() and status = 'pending' and public.is_org_member(organization_id));
create policy "Time off: admins decide" on public.time_off for update
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy "Time off: withdraw own pending" on public.time_off for delete
  using ((user_id = auth.uid() and status = 'pending') or public.is_org_admin(organization_id));
create index if not exists time_off_org_dates_idx on public.time_off (organization_id, start_date, end_date);

-- ── Rules (replaces free-text constraints) ─────────────────────────────────
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('cant_work_with','cant_be_alone','required_on_shift','max_shifts_week')),
  member_id uuid not null references public.profiles(id) on delete cascade,
  other_member_id uuid references public.profiles(id) on delete cascade,
  params jsonb not null default '{}'::jsonb,
  hard boolean not null default true,
  weight int not null default 1,
  created_at timestamptz not null default now(),
  check (kind <> 'cant_work_with' or (other_member_id is not null and other_member_id <> member_id))
);
alter table public.rules enable row level security;
create policy "Rules: members read" on public.rules for select using (public.is_org_member(organization_id));
create policy "Rules: admins write" on public.rules for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create index if not exists rules_org_idx on public.rules (organization_id);

-- Carry over any legacy constraints, matching people by name within the org.
insert into public.rules (organization_id, kind, member_id, other_member_id, params)
select x.organization_id, x.kind, x.member_id, x.other_member_id, x.params
  from (
    select c.organization_id,
           case c.type when 'can''t work with' then 'cant_work_with'
                       when 'can''t be alone' then 'cant_be_alone'
                       when 'required on shift' then 'required_on_shift'
                       else 'max_shifts_week' end as kind,
           (select p.id from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = c.organization_id and p.name = c.person limit 1) as member_id,
           (select p.id from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = c.organization_id and p.name = c.detail limit 1) as other_member_id,
           case when c.type = 'max shifts/week' and c.detail ~ '^\d+$' then jsonb_build_object('max', c.detail::int)
                when c.type = 'required on shift' then jsonb_build_object('note', c.detail)
                else '{}'::jsonb end as params,
           c.type
      from public.constraints c
  ) x
 where x.member_id is not null
   and x.type in ('can''t work with','can''t be alone','required on shift','max shifts/week')
   and (x.kind <> 'cant_work_with' or (x.other_member_id is not null and x.other_member_id <> x.member_id))
   and (x.kind <> 'max_shifts_week' or x.params ? 'max');

-- ── Schedule runs (every generation, for replay and "why" answers) ─────────
create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id bigint not null references public.schedules(id) on delete cascade,
  engine_version text not null,
  seed bigint,
  input_hash text,
  score numeric,
  result jsonb,
  explanations jsonb,
  duration_ms int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.schedule_runs enable row level security;
create policy "Runs: admins" on public.schedule_runs for all
  using (exists (select 1 from public.schedules s where s.id = schedule_id and public.is_org_admin(s.organization_id)))
  with check (exists (select 1 from public.schedules s where s.id = schedule_id and public.is_org_admin(s.organization_id)));

-- ── day_settings: the old unique key was global, so only one org could save ─
alter table public.day_settings drop constraint if exists day_settings_week_offset_day_index_key;

-- ── RPC: get or create a week's schedule ───────────────────────────────────
create or replace function public.ensure_week_schedule(p_org uuid, p_week_start date)
returns public.schedules
language plpgsql security definer set search_path = public as $$
declare r public.schedules;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.schedules (organization_id, kind, period_start, period_end, published)
  values (p_org, 'week', p_week_start, p_week_start + 6, false)
  on conflict (organization_id, period_start) where kind = 'week' do nothing;
  select * into r from public.schedules
   where organization_id = p_org and kind = 'week' and period_start = p_week_start;
  return r;
end $$;

-- ── RPC: save a whole rota atomically ──────────────────────────────────────
-- p_shifts: [{user_id, date, start_time, end_time, kind?, break_minutes?, role_id?, locked?}]
-- Returns the new version. Raises 'stale_version' (P0001) if someone saved first.
create or replace function public.save_schedule(p_schedule_id bigint, p_shifts jsonb, p_expected_version int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare s public.schedules; bad int;
begin
  select * into s from public.schedules where id = p_schedule_id for update;
  if not found then raise exception 'schedule not found'; end if;
  if not public.is_org_admin(s.organization_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_expected_version is not null and s.version <> p_expected_version then
    raise exception 'stale_version' using detail = format('expected %s, current %s', p_expected_version, s.version);
  end if;

  select count(*) into bad
    from jsonb_to_recordset(coalesce(p_shifts, '[]'::jsonb)) as x(user_id uuid, date date)
   where (x.user_id is not null and not exists (
            select 1 from public.organization_members m
             where m.organization_id = s.organization_id and m.user_id = x.user_id))
      or x.date is null or x.date < s.period_start or x.date > s.period_end;
  if bad > 0 then
    raise exception 'invalid shifts: % row(s) have a non-member or a date outside the period', bad;
  end if;

  delete from public.shifts where schedule_id = p_schedule_id;
  insert into public.shifts (schedule_id, user_id, date, day_index, start_time, end_time, kind, break_minutes, role_id, locked)
  select p_schedule_id, x.user_id, x.date, (x.date - s.period_start), x.start_time, x.end_time,
         coalesce(x.kind, 'regular'), coalesce(x.break_minutes, 0), x.role_id, coalesce(x.locked, false)
    from jsonb_to_recordset(coalesce(p_shifts, '[]'::jsonb))
         as x(user_id uuid, date date, start_time text, end_time text, kind text, break_minutes int, role_id uuid, locked boolean);

  update public.schedules set version = version + 1, generated_at = now()
   where id = p_schedule_id
  returning version into s.version;
  return s.version;
end $$;

revoke all on function public.save_schedule(bigint, jsonb, int) from public, anon;
grant execute on function public.save_schedule(bigint, jsonb, int) to authenticated;
revoke all on function public.ensure_week_schedule(uuid, date) from public, anon;
grant execute on function public.ensure_week_schedule(uuid, date) to authenticated;

commit;

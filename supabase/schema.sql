-- JobChain + JobPilot schema
-- Run once in Supabase Dashboard -> SQL Editor on a fresh project.
-- Safe to re-run: tables use IF NOT EXISTS, policies/triggers are dropped and recreated.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (identity; matches docs/MVP_SCHEMA_AND_EVENTS.md)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'candidate'
    check (role in ('candidate', 'employer_admin', 'employer_member')),
  wallet_address text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- jobs: manual tracking + bookmarks used by the current Next.js app
-- (/jobs, /bookmarks, /applied). Column names must match src/app/*.
-- No unique (user_id, job_url): the app may insert a bookmark row and an
-- applied row for the same URL.
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  company text,
  location text,
  job_url text not null,
  status text check (status in ('applied', 'interview', 'offer', 'rejected')),
  applied_at timestamptz,
  is_saved boolean not null default false,
  applied_via text not null default 'manual' check (applied_via in ('manual', 'email')),
  discovered_job_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_url_idx on public.jobs (user_id, job_url);
create index if not exists jobs_user_saved_idx on public.jobs (user_id) where is_saved;
create index if not exists jobs_user_applied_idx on public.jobs (user_id) where applied_at is not null;

-- ---------------------------------------------------------------------------
-- candidate_profiles: JobPilot's matching profile (replaces its local config).
-- Only claim what is recorded here.
-- ---------------------------------------------------------------------------

create table if not exists public.candidate_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferred_name text,
  github_url text,
  linkedin_url text,
  current_base text,
  role_family text,
  skills text[] not null default '{}',
  experience_years numeric(4, 1),
  -- preference, not a claim: apply to jobs asking for up to this many years
  max_required_experience_years numeric(4, 1),
  education text,
  -- e.g. [{"language": "English", "level": "C1"}]
  languages jsonb not null default '[]'::jsonb,
  needs_sponsorship boolean,
  target_countries text[] not null default '{}',
  keywords text[] not null default '{}',
  -- local path on the machine running JobPilot; the CV itself never leaves it
  cv_path text,
  send_mode text not null default 'dry_run' check (send_mode in ('dry_run', 'review', 'auto')),
  max_sends_per_run integer not null default 5 check (max_sends_per_run between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_profiles
  add column if not exists max_required_experience_years numeric(4, 1);

-- CV uploaded from /profile into the private "cvs" bucket at <user_id>/cv.pdf.
-- cv_path (local file) is only a fallback for local testing.
alter table public.candidate_profiles
  add column if not exists cv_storage_path text,
  add column if not exists cv_filename text;

-- ---------------------------------------------------------------------------
-- discovered_jobs: vacancies found and scored by JobPilot (written with the
-- service-role key; users can read them and dismiss them).
-- ---------------------------------------------------------------------------

create table if not exists public.discovered_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_url text not null,
  vacancy_id text,
  title text not null,
  company text,
  country text,
  location text,
  work_mode text check (work_mode in ('remote', 'hybrid', 'onsite')),
  contract_type text,
  description text,
  deadline date,
  apply_url text,
  apply_email text,
  apply_email_evidence text,
  contact_name text,
  required_skills text[] not null default '{}',
  nice_to_have_skills text[] not null default '{}',
  min_experience_years numeric(4, 1),
  languages jsonb not null default '[]'::jsonb,
  visa_phrases text[] not null default '{}',
  match_label text check (match_label in ('strong', 'possible', 'unlikely')),
  score integer,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  blockers text[] not null default '{}',
  unknowns text[] not null default '{}',
  -- [{"rule": "language", "result": "unknown", "evidence": "German preferred"}]
  reasons jsonb not null default '[]'::jsonb,
  content_hash text,
  dismissed boolean not null default false,
  discovered_at timestamptz not null default now(),
  evaluated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, source_url)
);

create index if not exists discovered_jobs_user_label_idx
  on public.discovered_jobs (user_id, match_label) where not dismissed;
create index if not exists discovered_jobs_vacancy_idx
  on public.discovered_jobs (user_id, source, vacancy_id);

alter table public.jobs
  drop constraint if exists jobs_discovered_job_id_fkey;
alter table public.jobs
  add constraint jobs_discovered_job_id_fkey
  foreign key (discovered_job_id) references public.discovered_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- application_drafts: emails JobPilot prepares; the user approves in the UI,
-- JobPilot sends via Gmail and records the outcome.
-- ---------------------------------------------------------------------------

create table if not exists public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  discovered_job_id uuid not null references public.discovered_jobs (id) on delete cascade,
  recipient text not null,
  recipient_evidence text,
  subject text not null,
  body text not null,
  cv_filename text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'sending', 'sent', 'failed')),
  approved_at timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_drafts_user_status_idx
  on public.application_drafts (user_id, status);

-- Never send twice for the same vacancy.
create unique index if not exists application_drafts_one_send_per_job
  on public.application_drafts (discovered_job_id)
  where status in ('sending', 'sent');

-- Signed-in users may only edit the text and move draft <-> approved/rejected.
-- Sending states and Gmail fields are reserved for JobPilot (service role).
create or replace function public.guard_application_draft_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return new;
  end if;

  if old.status not in ('draft', 'approved', 'rejected')
     or new.status not in ('draft', 'approved', 'rejected') then
    raise exception 'status % -> % is not allowed from the app', old.status, new.status;
  end if;

  if new.sent_at is distinct from old.sent_at
     or new.gmail_message_id is distinct from old.gmail_message_id
     or new.error is distinct from old.error
     or new.recipient is distinct from old.recipient
     or new.discovered_job_id is distinct from old.discovered_job_id
     or new.user_id is distinct from old.user_id then
    raise exception 'only subject, body and status can be changed from the app';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_at = now();
  elsif new.status <> 'approved' then
    new.approved_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists application_drafts_guard on public.application_drafts;
create trigger application_drafts_guard
  before update on public.application_drafts
  for each row execute function public.guard_application_draft_update();

-- ---------------------------------------------------------------------------
-- pipeline_events: JobPilot run log / audit trail. Never store tokens here.
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid,
  event_type text not null,
  discovered_job_id uuid references public.discovered_jobs (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_events_user_created_idx
  on public.pipeline_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists candidate_profiles_updated_at on public.candidate_profiles;
create trigger candidate_profiles_updated_at before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists discovered_jobs_updated_at on public.discovered_jobs;
create trigger discovered_jobs_updated_at before update on public.discovered_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists application_drafts_updated_at on public.application_drafts;
create trigger application_drafts_updated_at before update on public.application_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (the service-role key used by JobPilot bypasses RLS)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.discovered_jobs enable row level security;
alter table public.application_drafts enable row level security;
alter table public.pipeline_events enable row level security;

-- profiles
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- jobs (full CRUD on own rows)
drop policy if exists "jobs: select own" on public.jobs;
create policy "jobs: select own" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "jobs: insert own" on public.jobs;
create policy "jobs: insert own" on public.jobs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "jobs: update own" on public.jobs;
create policy "jobs: update own" on public.jobs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "jobs: delete own" on public.jobs;
create policy "jobs: delete own" on public.jobs
  for delete to authenticated using (user_id = (select auth.uid()));

-- candidate_profiles
drop policy if exists "candidate_profiles: select own" on public.candidate_profiles;
create policy "candidate_profiles: select own" on public.candidate_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "candidate_profiles: insert own" on public.candidate_profiles;
create policy "candidate_profiles: insert own" on public.candidate_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "candidate_profiles: update own" on public.candidate_profiles;
create policy "candidate_profiles: update own" on public.candidate_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- discovered_jobs: read + dismiss only; JobPilot inserts
drop policy if exists "discovered_jobs: select own" on public.discovered_jobs;
create policy "discovered_jobs: select own" on public.discovered_jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "discovered_jobs: update own" on public.discovered_jobs;
create policy "discovered_jobs: update own" on public.discovered_jobs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- application_drafts: read + review (guard trigger limits what changes)
drop policy if exists "application_drafts: select own" on public.application_drafts;
create policy "application_drafts: select own" on public.application_drafts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "application_drafts: update own" on public.application_drafts;
create policy "application_drafts: update own" on public.application_drafts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- pipeline_events: read only
drop policy if exists "pipeline_events: select own" on public.pipeline_events;
create policy "pipeline_events: select own" on public.pipeline_events
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Gmail sending: each user connects their own Gmail from /profile.
-- email_accounts: which address (owner can read). email_tokens: AES-GCM encrypted
-- refresh tokens, RLS with no policies so only the service role (JobPilot) reads them.
-- Both are written only through connect_gmail()/disconnect_gmail(), acting for auth.uid().
-- ---------------------------------------------------------------------------

create table if not exists public.email_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text not null,
  connected_at timestamptz not null default now()
);

create table if not exists public.email_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.email_accounts enable row level security;
alter table public.email_tokens enable row level security;

drop policy if exists "email_accounts: select own" on public.email_accounts;
create policy "email_accounts: select own" on public.email_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.connect_gmail(p_email text, p_refresh_token_encrypted text, p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.email_accounts (user_id, provider, email, connected_at)
  values (auth.uid(), 'gmail', p_email, now())
  on conflict (user_id) do update set email = excluded.email, connected_at = now();
  insert into public.email_tokens (user_id, refresh_token_encrypted, scope, updated_at)
  values (auth.uid(), p_refresh_token_encrypted, p_scope, now())
  on conflict (user_id) do update
    set refresh_token_encrypted = excluded.refresh_token_encrypted, scope = excluded.scope, updated_at = now();
end;
$$;

create or replace function public.disconnect_gmail()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.email_tokens where user_id = auth.uid();
  delete from public.email_accounts where user_id = auth.uid();
$$;

revoke all on function public.connect_gmail(text, text, text) from public, anon;
revoke all on function public.disconnect_gmail() from public, anon;
grant execute on function public.connect_gmail(text, text, text) to authenticated;
grant execute on function public.disconnect_gmail() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private CV bucket, one folder per user (<user_id>/cv.pdf).
-- JobPilot downloads with the service-role key when attaching to an email.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cvs: read own" on storage.objects;
create policy "cvs: read own" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: upload own" on storage.objects;
create policy "cvs: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: replace own" on storage.objects;
create policy "cvs: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: delete own" on storage.objects;
create policy "cvs: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- JobPilot tab: runs requested from the app, executed by the worker
-- (`python -m jobpilot worker`), which logs each step to pipeline_events.
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('search', 'send')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'finished', 'failed', 'cancelled')),
  current_step text,
  counts jsonb not null default '{}'::jsonb,
  error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists pipeline_runs_user_idx on public.pipeline_runs (user_id, requested_at desc);
create index if not exists pipeline_runs_queue_idx on public.pipeline_runs (requested_at) where status = 'queued';
create unique index if not exists pipeline_runs_one_active
  on public.pipeline_runs (user_id) where status in ('queued', 'running');
create index if not exists pipeline_events_run_idx on public.pipeline_events (run_id, id);

create table if not exists public.pipeline_workers (
  id text primary key,
  last_seen timestamptz not null default now(),
  version text
);

alter table public.pipeline_workers
  add column if not exists sending_enabled boolean not null default false;

alter table public.pipeline_runs enable row level security;
alter table public.pipeline_workers enable row level security;

drop policy if exists "pipeline_runs: select own" on public.pipeline_runs;
create policy "pipeline_runs: select own" on public.pipeline_runs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "pipeline_runs: request own" on public.pipeline_runs;
create policy "pipeline_runs: request own" on public.pipeline_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'queued' and started_at is null and finished_at is null);
drop policy if exists "pipeline_runs: cancel own" on public.pipeline_runs;
create policy "pipeline_runs: cancel own" on public.pipeline_runs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "pipeline_workers: read" on public.pipeline_workers;
create policy "pipeline_workers: read" on public.pipeline_workers
  for select to authenticated using (true);

create or replace function public.guard_pipeline_run_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return new;
  end if;
  if new.status <> 'cancelled' or old.status not in ('queued', 'running')
     or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'runs can only be cancelled from the app';
  end if;
  return new;
end;
$$;

drop trigger if exists pipeline_runs_guard on public.pipeline_runs;
create trigger pipeline_runs_guard before update on public.pipeline_runs
  for each row execute function public.guard_pipeline_run_update();

-- Draft runs: write an application for one job picked in Found jobs (optional recipient typed by the user).
alter table public.pipeline_runs
  add column if not exists discovered_job_id uuid references public.discovered_jobs (id) on delete cascade,
  add column if not exists recipient text;
alter table public.pipeline_runs drop constraint if exists pipeline_runs_kind_check;
alter table public.pipeline_runs add constraint pipeline_runs_kind_check check (kind in ('search', 'send', 'draft'));

-- Queue position of the caller's own queued run (1 = next), plus how many runs are running.
-- Reveals only counts, never other users' runs.
create or replace function public.run_queue_position(p_run_id uuid)
returns table (ahead integer, running integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from pipeline_runs q, pipeline_runs mine
      where mine.id = p_run_id and mine.user_id = auth.uid() and mine.status = 'queued'
        and q.status = 'queued' and q.requested_at < mine.requested_at),
    (select count(*)::int from pipeline_runs where status = 'running');
$$;
revoke all on function public.run_queue_position(uuid) from public, anon;
grant execute on function public.run_queue_position(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared job pool: vacancies fetched once for all users (worker-only: RLS on, no policies).
-- job_pool_fetches records when each keyword ("kw:<keyword>") or feed ("feed:<source>") was fetched.
-- ---------------------------------------------------------------------------

create table if not exists public.job_pool (
  source_url text primary key,
  source text not null,
  data jsonb not null,
  content_hash text,
  fetched_at timestamptz not null default now()
);
create index if not exists job_pool_fetched_idx on public.job_pool (fetched_at desc);

create table if not exists public.job_pool_fetches (
  key text primary key,
  fetched_at timestamptz not null default now()
);

alter table public.job_pool enable row level security;
alter table public.job_pool_fetches enable row level security;

-- Date the source published the vacancy.
alter table public.discovered_jobs add column if not exists posted_at date;

-- ---------------------------------------------------------------------------
-- Jobs page: searchable shared pool, search_jobs(), adopt_pool_job(), lookup runs.
-- ---------------------------------------------------------------------------
-- Searchable columns on the shared pool (written by the worker; backfilled here once).
alter table public.job_pool
  add column if not exists title text,
  add column if not exists company text,
  add column if not exists country text,
  add column if not exists location text,
  add column if not exists posted_at date,
  add column if not exists deadline date,
  add column if not exists has_email boolean not null default false;

update public.job_pool p set
  title = data->>'title',
  company = data->>'company',
  country = data->>'country',
  location = data->>'location',
  has_email = coalesce(data->'structured'->>'contact_email', '') <> '',
  deadline = case when (data->'structured'->>'deadline') ~ '^\d{4}-\d{2}-\d{2}$' then (data->'structured'->>'deadline')::date end,
  posted_at = coalesce(
    case when (data->>'posted_at') ~ '^\d{4}-\d{2}-\d{2}$' then (data->>'posted_at')::date end,
    (select d.posted_at from public.discovered_jobs d where d.source_url = p.source_url and d.posted_at is not null limit 1))
where title is null or posted_at is null;

alter table public.job_pool add column if not exists search tsvector
  generated always as (to_tsvector('simple',
    coalesce(data->>'title', '') || ' ' || coalesce(data->>'company', '') || ' ' ||
    coalesce(data->>'location', '') || ' ' || coalesce(data->>'country', '') || ' ' ||
    left(coalesce(data->>'description', ''), 4000))) stored;
create index if not exists job_pool_search_idx on public.job_pool using gin (search);
create index if not exists job_pool_posted_idx on public.job_pool (posted_at desc);

-- Search the shared pool: fresh jobs only (posted in the last 15 days, deadline not passed).
-- Returns public job-ad fields; the recruiter's email stays hidden (only has_email).
create or replace function public.search_jobs(p_query text default '', p_country text default '',
                                              p_limit int default 30, p_offset int default 0)
returns table (source_url text, source text, title text, company text, country text, location text,
               posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public
as $$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int) from public, anon;
grant execute on function public.search_jobs(text, text, int, int) to authenticated;

-- Adds a pool job to the caller's own jobs (to bookmark, mark applied or write an application).
create or replace function public.adopt_pool_job(p_source_url text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  job_id uuid;
  d jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into job_id from discovered_jobs where user_id = auth.uid() and source_url = p_source_url;
  if job_id is not null then return job_id; end if;
  select data into d from job_pool where source_url = p_source_url;
  if d is null then raise exception 'job not found'; end if;
  insert into discovered_jobs (user_id, source, source_url, vacancy_id, title, company, country, location,
                               work_mode, contract_type, description, apply_url, content_hash, posted_at,
                               deadline, apply_email, apply_email_evidence, contact_name)
  values (auth.uid(), d->>'source', p_source_url, d->>'vacancy_id', d->>'title', d->>'company', d->>'country',
          d->>'location', nullif(d->>'work_mode', ''), d->>'contract_type', d->>'description', d->>'apply_url',
          d->>'content_hash',
          case when (d->>'posted_at') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'posted_at')::date end,
          case when (d->'structured'->>'deadline') ~ '^\d{4}-\d{2}-\d{2}$' then (d->'structured'->>'deadline')::date end,
          d->'structured'->>'contact_email', d->'structured'->>'contact_evidence', d->'structured'->>'contact_name')
  returning id into job_id;
  return job_id;
end;
$$;
revoke all on function public.adopt_pool_job(text) from public, anon;
grant execute on function public.adopt_pool_job(text) to authenticated;

-- "lookup" runs fetch one search query live when the pool has too few results.
alter table public.pipeline_runs add column if not exists query text;
alter table public.pipeline_runs drop constraint if exists pipeline_runs_kind_check;
alter table public.pipeline_runs add constraint pipeline_runs_kind_check
  check (kind in ('search', 'send', 'draft', 'lookup'));

-- Public preview of the Jobs page for visitors who are not signed in. Deliberately leaves out
-- anything that leads to the posting outside JobChain: no link, company, email or description.
create or replace function public.preview_jobs(p_query text default '', p_country text default '', p_limit int default 24)
returns table (id text, title text, country text, location text, posted_at date, deadline date, has_email boolean)
language sql stable security definer set search_path = public
as $$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select md5(p.source_url), p.title, p.country, p.location, p.posted_at, p.deadline, p.has_email
  from public.job_pool p, q
  where coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 24);
$$;
revoke all on function public.preview_jobs(text, text, int) from public;
grant execute on function public.preview_jobs(text, text, int) to anon, authenticated;

-- Country list for the visitors' filter (only countries that have fresh jobs).
create or replace function public.preview_countries()
returns table (country text, jobs bigint)
language sql stable security definer set search_path = public
as $$
  select p.country, count(*) from public.job_pool p
  where p.country is not null and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
  group by p.country order by count(*) desc;
$$;
revoke all on function public.preview_countries() from public;
grant execute on function public.preview_countries() to anon, authenticated;
-- search_jobs with a "quick apply only" filter (jobs whose ad lists an application email).
drop function if exists public.search_jobs(text, text, int, int);
create or replace function public.search_jobs(p_query text default '', p_country text default '',
                                              p_limit int default 30, p_offset int default 0,
                                              p_email_only boolean default false)
returns table (source_url text, source text, title text, company text, country text, location text,
               posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public
as $$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
    and (not p_email_only or p.has_email)
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           p.has_email desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int, boolean) from public, anon;
grant execute on function public.search_jobs(text, text, int, int, boolean) to authenticated;

-- One active search/send/lookup per user, but any number of "write this application" runs
-- (one per job, so double-clicks do not write two drafts).
drop index if exists public.pipeline_runs_one_active;
create unique index pipeline_runs_one_active
  on public.pipeline_runs (user_id) where status in ('queued', 'running') and kind <> 'draft';
create unique index if not exists pipeline_runs_one_draft_per_job
  on public.pipeline_runs (discovered_job_id) where status in ('queued', 'running') and kind = 'draft';

-- Worker reads each user's fresh, relevant pool jobs from the database instead of loading the
-- whole pool; details only for jobs this user has not scored yet. Old jobs are pruned after 30 days.
create or replace function public.pool_candidates(
  p_user_id uuid, p_title_patterns text[], p_country_patterns text[], p_days int default 15)
returns table(source_url text, source text, title text, company text, country text, location text,
              work_mode text, content_hash text, data jsonb)
language sql stable security definer set search_path = public as $$
  select p.source_url, p.source, p.title, p.company, p.country, p.location,
         p.data->>'work_mode', p.content_hash,
         case when exists (select 1 from discovered_jobs d
                           where d.user_id = p_user_id and d.source_url = p.source_url
                             and d.content_hash is not distinct from p.content_hash
                             and d.evaluated_at is not null)
              then null else p.data end
  from job_pool p
  where coalesce(p.posted_at, p.fetched_at::date) >= current_date - p_days
    and (p.deadline is null or p.deadline >= current_date)
    and (coalesce(cardinality(p_title_patterns), 0) = 0
         or replace(replace(lower(p.title), 'front-end', 'frontend'), 'front end', 'frontend')
            like any (p_title_patterns))
    and (coalesce(cardinality(p_country_patterns), 0) = 0
         or p.country is null
         or lower(coalesce(p.country, '') || ' ' || coalesce(p.location, '')) like any (p_country_patterns));
$$;
revoke all on function public.pool_candidates(uuid, text[], text[], int) from public, anon, authenticated;
grant execute on function public.pool_candidates(uuid, text[], text[], int) to service_role;

create or replace function public.prune_stale_jobs(p_days int default 30)
returns void language sql security definer set search_path = public as $$
  delete from job_pool
  where coalesce(posted_at, fetched_at::date) < current_date - p_days;
  delete from discovered_jobs d
  where coalesce(d.posted_at, d.discovered_at::date) < current_date - p_days
    and not exists (select 1 from application_drafts a where a.discovered_job_id = d.id)
    and not exists (select 1 from jobs j where j.discovered_job_id = d.id)
    and not exists (select 1 from pipeline_runs r where r.discovered_job_id = d.id);
$$;
revoke all on function public.prune_stale_jobs(int) from public, anon, authenticated;
grant execute on function public.prune_stale_jobs(int) to service_role;

-- Jobs page search hides the user's unlikely and applied jobs in the query, so pages stay full.
-- Jobs page search over the shared pool. Hides, for the signed-in user, jobs JobPilot scored as
-- unlikely (p_hide_unlikely) and jobs they already applied to (p_hide_applied), in the query
-- itself so every page is full.
drop function if exists public.search_jobs(text, text, int, int, boolean);
create or replace function public.search_jobs(p_query text default '', p_country text default '',
  p_limit int default 30, p_offset int default 0, p_email_only boolean default false,
  p_hide_unlikely boolean default false, p_hide_applied boolean default false)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
    and (not p_email_only or p.has_email)
    and (not p_hide_unlikely or not exists (
      select 1 from discovered_jobs d
      where d.user_id = auth.uid() and d.source_url = p.source_url and d.match_label = 'unlikely'))
    and (not p_hide_applied or not exists (
      select 1 from jobs j
      left join discovered_jobs d on d.id = j.discovered_job_id
      where j.user_id = auth.uid() and j.applied_at is not null
        and (j.job_url = p.source_url or d.source_url = p.source_url)))
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           p.has_email desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int, boolean, boolean, boolean) from public, anon;
grant execute on function public.search_jobs(text, text, int, int, boolean, boolean, boolean) to authenticated;

-- When the caller's job titles were last fetched from the sources and when they can be again.
CREATE OR REPLACE FUNCTION public.search_freshness(p_recheck_minutes integer DEFAULT 60)
 RETURNS TABLE(last_searched_at timestamp with time zone, next_fresh_at timestamp with time zone, titles integer, waiting integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- When the caller's job titles were last fetched from the sources, and from when a search
  -- can fetch at least one of them again (null = now). Mirrors pool.keyword_key() / RECHECK_HOURS.
  with mine as (
    select 'kw:' || lower(regexp_replace(trim(k), '\s+', ' ', 'g')) as key
    from candidate_profiles, unnest(keywords) k
    where user_id = auth.uid() and trim(k) <> ''
  ), times as (
    select m.key, f.fetched_at from mine m left join job_pool_fetches f on f.key = m.key
  )
  select max(fetched_at),
         case when bool_or(fetched_at is null or fetched_at < now() - make_interval(mins => p_recheck_minutes))
              then null
              else min(fetched_at) + make_interval(mins => p_recheck_minutes) end,
         count(*)::int,
         count(*) filter (where fetched_at >= now() - make_interval(mins => p_recheck_minutes))::int
  from times;
$function$

;
revoke all on function public.search_freshness(int) from public, anon;
grant execute on function public.search_freshness(int) to authenticated;

-- search_jobs v2: Latest jobs filtered to the user's own titles and countries (replaces the version above).
-- Jobs page search over the shared pool. Hides, for the signed-in user, jobs JobPilot scored as
-- unlikely (p_hide_unlikely) and jobs they already applied to (p_hide_applied), in the query
-- itself so every page is full.
drop function if exists public.search_jobs(text, text, int, int, boolean);
drop function if exists public.search_jobs(text, text, int, int, boolean, boolean, boolean);
create or replace function public.search_jobs(p_query text default '', p_country text default '',
  p_limit int default 30, p_offset int default 0, p_email_only boolean default false,
  p_hide_unlikely boolean default false, p_hide_applied boolean default false,
  p_title_patterns text[] default null, p_country_patterns text[] default null)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
    and (not p_email_only or p.has_email)
    -- "Latest jobs" for this user: titles and countries from their profile (same cut as pool_candidates).
    and (coalesce(cardinality(p_title_patterns), 0) = 0
         or replace(replace(lower(p.title), 'front-end', 'frontend'), 'front end', 'frontend')
            like any (p_title_patterns))
    and (coalesce(cardinality(p_country_patterns), 0) = 0 or p.country is null
         or lower(coalesce(p.country, '') || ' ' || coalesce(p.location, '')) like any (p_country_patterns))
    and (not p_hide_unlikely or not exists (
      select 1 from discovered_jobs d
      where d.user_id = auth.uid() and d.source_url = p.source_url and d.match_label = 'unlikely'))
    and (not p_hide_applied or not exists (
      select 1 from jobs j
      left join discovered_jobs d on d.id = j.discovered_job_id
      where j.user_id = auth.uid() and j.applied_at is not null
        and (j.job_url = p.source_url or d.source_url = p.source_url)))
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           p.has_email desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) from public, anon;
grant execute on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) to authenticated;

-- Shared job links (/jobs?job=<source url>): the full job for signed-in users, and the same safe
-- preview fields as preview_jobs() for visitors (no company, link, email or description).
create or replace function public.get_shared_job(p_source_url text)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220), 0::real
  from public.job_pool p
  where auth.uid() is not null and p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15;
$$;
revoke all on function public.get_shared_job(text) from public, anon;
grant execute on function public.get_shared_job(text) to authenticated;

create or replace function public.preview_shared_job(p_source_url text)
returns table(id text, title text, country text, location text, posted_at date, deadline date, has_email boolean)
language sql stable security definer set search_path = public as $$
  select md5(p.source_url), p.title, p.country, p.location, p.posted_at, p.deadline, p.has_email
  from public.job_pool p
  where p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 15;
$$;
revoke all on function public.preview_shared_job(text) from public;
grant execute on function public.preview_shared_job(text) to anon, authenticated;

-- Jobs page lists 30 days (JobPilot matching stays 15); typed searches treat role words as optional.
-- Jobs page search over the shared pool. Hides, for the signed-in user, jobs JobPilot scored as
-- unlikely (p_hide_unlikely) and jobs they already applied to (p_hide_applied), in the query
-- itself so every page is full.
drop function if exists public.search_jobs(text, text, int, int, boolean);
drop function if exists public.search_jobs(text, text, int, int, boolean, boolean, boolean);
create or replace function public.search_jobs(p_query text default '', p_country text default '',
  p_limit int default 30, p_offset int default 0, p_email_only boolean default false,
  p_hide_unlikely boolean default false, p_hide_applied boolean default false,
  p_title_patterns text[] default null, p_country_patterns text[] default null)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  -- Generic role words are optional ("CNC programmer" also finds "CNC-Fräser"), as in pool.core_terms().
  with core as (
    select nullif(trim(regexp_replace(coalesce(p_query, ''),
      '\\m(developers?|engineers?|programmers?|devs?|entwickler(in)?|softwareentwickler|ontwikkelaar|développeur)\\M',
      ' ', 'gi')), '') as text
  ), q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', coalesce(core.text, p_query)) end as tsq
    from core
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
    and (not p_email_only or p.has_email)
    -- "Latest jobs" for this user: titles and countries from their profile (same cut as pool_candidates).
    and (coalesce(cardinality(p_title_patterns), 0) = 0
         or replace(replace(lower(p.title), 'front-end', 'frontend'), 'front end', 'frontend')
            like any (p_title_patterns))
    and (coalesce(cardinality(p_country_patterns), 0) = 0 or p.country is null
         or lower(coalesce(p.country, '') || ' ' || coalesce(p.location, '')) like any (p_country_patterns))
    and (not p_hide_unlikely or not exists (
      select 1 from discovered_jobs d
      where d.user_id = auth.uid() and d.source_url = p.source_url and d.match_label = 'unlikely'))
    and (not p_hide_applied or not exists (
      select 1 from jobs j
      left join discovered_jobs d on d.id = j.discovered_job_id
      where j.user_id = auth.uid() and j.applied_at is not null
        and (j.job_url = p.source_url or d.source_url = p.source_url)))
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           p.has_email desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) from public, anon;
grant execute on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) to authenticated;
-- Shared job links (/jobs?job=<source url>): the full job for signed-in users, and the same safe
-- preview fields as preview_jobs() for visitors (no company, link, email or description).
create or replace function public.get_shared_job(p_source_url text)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220), 0::real
  from public.job_pool p
  where auth.uid() is not null and p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30;
$$;
revoke all on function public.get_shared_job(text) from public, anon;
grant execute on function public.get_shared_job(text) to authenticated;

create or replace function public.preview_shared_job(p_source_url text)
returns table(id text, title text, country text, location text, posted_at date, deadline date, has_email boolean)
language sql stable security definer set search_path = public as $$
  select md5(p.source_url), p.title, p.country, p.location, p.posted_at, p.deadline, p.has_email
  from public.job_pool p
  where p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30;
$$;
revoke all on function public.preview_shared_job(text) from public;
grant execute on function public.preview_shared_job(text) to anon, authenticated;
CREATE OR REPLACE FUNCTION public.preview_jobs(p_query text DEFAULT ''::text, p_country text DEFAULT ''::text, p_limit integer DEFAULT 24)
 RETURNS TABLE(id text, title text, country text, location text, posted_at date, deadline date, has_email boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', p_query) end as tsq
  )
  select md5(p.source_url), p.title, p.country, p.location, p.posted_at, p.deadline, p.has_email
  from public.job_pool p, q
  where coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 24);
$function$
;
CREATE OR REPLACE FUNCTION public.preview_countries()
 RETURNS TABLE(country text, jobs bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.country, count(*) from public.job_pool p
  where p.country is not null and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date)
  group by p.country order by count(*) desc;
$function$
;

-- Closed vacancies (deadline passed) are never listed, shared or kept.
-- Shared job links (/jobs?job=<source url>): the full job for signed-in users, and the same safe
-- preview fields as preview_jobs() for visitors (no company, link, email or description).
create or replace function public.get_shared_job(p_source_url text)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220), 0::real
  from public.job_pool p
  where auth.uid() is not null and p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date);
$$;
revoke all on function public.get_shared_job(text) from public, anon;
grant execute on function public.get_shared_job(text) to authenticated;

create or replace function public.preview_shared_job(p_source_url text)
returns table(id text, title text, country text, location text, posted_at date, deadline date, has_email boolean)
language sql stable security definer set search_path = public as $$
  select md5(p.source_url), p.title, p.country, p.location, p.posted_at, p.deadline, p.has_email
  from public.job_pool p
  where p.source_url = p_source_url
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date);
$$;
revoke all on function public.preview_shared_job(text) from public;
grant execute on function public.preview_shared_job(text) to anon, authenticated;
-- Cleanup: postings older than p_days or past their application deadline (and users' scored
-- copies of them that no draft, tracker entry or run still uses).
create or replace function public.prune_stale_jobs(p_days int default 31)
returns void language sql security definer set search_path = public as $$
  delete from job_pool
  where coalesce(posted_at, fetched_at::date) < current_date - p_days or deadline < current_date;
  delete from discovered_jobs d
  where (coalesce(d.posted_at, d.discovered_at::date) < current_date - p_days or d.deadline < current_date)
    and not exists (select 1 from application_drafts a where a.discovered_job_id = d.id)
    and not exists (select 1 from jobs j where j.discovered_job_id = d.id)
    and not exists (select 1 from pipeline_runs r where r.discovered_job_id = d.id);
$$;
revoke all on function public.prune_stale_jobs(int) from public, anon, authenticated;
grant execute on function public.prune_stale_jobs(int) to service_role;

-- Users' scored copies get the posting date once the pool knows it (copies are only rewritten
-- when a job changes, so a date found later would otherwise never reach them).
create or replace function public.copy_posted_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.posted_at is not null then
    update discovered_jobs set posted_at = new.posted_at
    where source_url = new.source_url and posted_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists job_pool_copy_posted_at on public.job_pool;
create trigger job_pool_copy_posted_at after insert or update of posted_at on public.job_pool
  for each row execute function public.copy_posted_at();

-- Commas in a typed search separate titles: "Frontend Developer, React Developer" finds either.
create or replace function public.search_jobs(p_query text default '', p_country text default '',
  p_limit int default 30, p_offset int default 0, p_email_only boolean default false,
  p_hide_unlikely boolean default false, p_hide_applied boolean default false,
  p_title_patterns text[] default null, p_country_patterns text[] default null)
returns table(source_url text, source text, title text, company text, country text, location text,
              posted_at date, deadline date, has_email boolean, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  -- Generic role words are optional ("CNC programmer" also finds "CNC-Fräser"), as in pool.core_terms().
  with core as (
    select nullif(trim(regexp_replace(coalesce(p_query, ''),
      '\\m(developers?|engineers?|programmers?|devs?|entwickler(in)?|softwareentwickler|ontwikkelaar|développeur)\\M',
      ' ', 'gi')), '') as text
  ), q as (
    select case when trim(coalesce(p_query, '')) = '' then null
           else websearch_to_tsquery('simple', regexp_replace(btrim(coalesce(core.text, p_query), ' ,'),
                  '(\s*,\s*)+', ' or ', 'g')) end as tsq
    from core
  )
  select p.source_url, p.source, p.title, p.company, p.country, p.location, p.posted_at, p.deadline,
         p.has_email, left(regexp_replace(coalesce(p.data->>'description', ''), '\s+', ' ', 'g'), 220),
         case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end
  from public.job_pool p, q
  where auth.uid() is not null
    and coalesce(p.posted_at, p.fetched_at::date) >= current_date - 30
    and (p.deadline is null or p.deadline >= current_date)
    and (q.tsq is null or p.search @@ q.tsq)
    and (coalesce(p_country, '') = '' or p.country ilike p_country)
    and (not p_email_only or p.has_email)
    -- "Latest jobs" for this user: titles and countries from their profile (same cut as pool_candidates).
    and (coalesce(cardinality(p_title_patterns), 0) = 0
         or replace(replace(lower(p.title), 'front-end', 'frontend'), 'front end', 'frontend')
            like any (p_title_patterns))
    and (coalesce(cardinality(p_country_patterns), 0) = 0 or p.country is null
         or lower(coalesce(p.country, '') || ' ' || coalesce(p.location, '')) like any (p_country_patterns))
    and (not p_hide_unlikely or not exists (
      select 1 from discovered_jobs d
      where d.user_id = auth.uid() and d.source_url = p.source_url and d.match_label = 'unlikely'))
    and (not p_hide_applied or not exists (
      select 1 from jobs j
      left join discovered_jobs d on d.id = j.discovered_job_id
      where j.user_id = auth.uid() and j.applied_at is not null
        and (j.job_url = p.source_url or d.source_url = p.source_url)))
  order by case when q.tsq is null then 0 else ts_rank(p.search, q.tsq) end desc,
           p.has_email desc,
           coalesce(p.posted_at, p.fetched_at::date) desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) from public, anon;
grant execute on function public.search_jobs(text, text, int, int, boolean, boolean, boolean, text[], text[]) to authenticated;

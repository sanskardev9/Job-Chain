-- Logged-in home, active-user daily automation, and safe failed-email retries.

alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.candidate_profiles
  add column if not exists auto_search_enabled boolean not null default true;

create or replace function public.mark_user_active()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set last_active_at = now()
  where id = auth.uid()
    and (last_active_at is null or last_active_at < now() - interval '6 hours');
end;
$$;
revoke all on function public.mark_user_active() from public, anon;
grant execute on function public.mark_user_active() to authenticated;

create or replace function public.queue_active_jobpilot_searches(
  p_active_days integer default 7,
  p_min_hours integer default 24,
  p_limit integer default 25
)
returns integer language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  with eligible as (
    select c.user_id
    from candidate_profiles c join profiles p on p.id = c.user_id
    where c.auto_search_enabled
      and p.last_active_at >= now() - make_interval(days => greatest(p_active_days, 1))
      and cardinality(c.skills) > 0
      and cardinality(c.keywords) > 0
      and c.cv_storage_path is not null
      and not exists (
        select 1 from pipeline_runs active where active.user_id = c.user_id
          and active.status in ('queued', 'running') and active.kind <> 'draft')
      and not exists (
        select 1 from pipeline_runs recent where recent.user_id = c.user_id
          and recent.kind = 'search'
          and recent.requested_at >= now() - make_interval(hours => greatest(p_min_hours, 1)))
    order by coalesce((
      select max(previous.requested_at) from pipeline_runs previous
      where previous.user_id = c.user_id and previous.kind = 'search'
    ), '-infinity'::timestamptz), p.last_active_at desc
    limit least(greatest(p_limit, 1), 100)
  ), inserted as (
    insert into pipeline_runs (user_id, kind)
    select user_id, 'search' from eligible on conflict do nothing returning 1
  )
  select count(*)::integer into queued from inserted;
  return queued;
end;
$$;
revoke all on function public.queue_active_jobpilot_searches(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.queue_active_jobpilot_searches(integer, integer, integer) to service_role;

create or replace function public.guard_application_draft_update()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then return new; end if;
  if not (
    (old.status in ('draft', 'approved', 'rejected') and new.status in ('draft', 'approved', 'rejected'))
    or (old.status = 'failed' and new.status = 'approved')
  ) then
    raise exception 'status % -> % is not allowed from the app', old.status, new.status;
  end if;
  if new.sent_at is distinct from old.sent_at
     or new.gmail_message_id is distinct from old.gmail_message_id
     or (new.error is distinct from old.error and not (old.status = 'failed' and new.status = 'approved' and new.error is null))
     or (new.recipient is distinct from old.recipient and not (old.status = 'failed' and new.status = 'approved'))
     or new.discovered_job_id is distinct from old.discovered_job_id
     or new.user_id is distinct from old.user_id then
    raise exception 'only subject, body and status can be changed from the app';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then new.approved_at = now();
  elsif new.status <> 'approved' then new.approved_at = null;
  end if;
  return new;
end;
$$;

-- Gmail OAuth testing access workflow and owner browser notifications.

create table if not exists public.gmail_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  account_email text not null,
  full_name text,
  requested_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'connected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 500)
);
create index if not exists gmail_access_requests_status_idx on public.gmail_access_requests (status, requested_at desc);
alter table public.gmail_access_requests enable row level security;
drop policy if exists "gmail requests: read own" on public.gmail_access_requests;
create policy "gmail requests: read own" on public.gmail_access_requests
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.gmail_access_requests from anon, authenticated;
grant select on public.gmail_access_requests to authenticated;

create or replace function public.mark_gmail_request_connected(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update gmail_access_requests set status = 'connected', reviewed_at = coalesce(reviewed_at, now())
  where user_id = auth.uid() and status = 'approved' and lower(requested_email) = lower(trim(p_email));
  if not found then raise exception 'This Gmail address has not been approved yet'; end if;
end;
$$;
revoke all on function public.mark_gmail_request_connected(text) from public, anon;
grant execute on function public.mark_gmail_request_connected(text) to authenticated;

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

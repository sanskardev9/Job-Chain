-- Owner-authored notifications sent to one or many opted-in JobChain users.
create table if not exists public.notification_messages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete restrict,
  user_ids uuid[] not null default '{}',
  title text not null check (char_length(title) between 1 and 80),
  body text check (char_length(body) <= 240),
  url text not null default '/home' check (char_length(url) <= 200),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  device_count integer not null default 0 check (device_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists notification_messages_created_idx on public.notification_messages (created_at desc);
alter table public.notification_messages enable row level security;
revoke all on public.notification_messages from anon, authenticated;

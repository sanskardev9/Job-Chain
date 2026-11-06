-- The approval queue was added after some users had already connected Gmail.
-- Preserve their access: only first-time Gmail connections need manual approval.
insert into public.gmail_access_requests (
  user_id,
  account_email,
  full_name,
  requested_email,
  status,
  requested_at,
  reviewed_at,
  review_note
)
select
  account.user_id,
  auth_user.email,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(auth_user.email, '@', 1)),
  lower(account.email),
  'connected',
  coalesce(account.connected_at, now()),
  now(),
  'Existing Gmail connection'
from public.email_accounts account
join auth.users auth_user on auth_user.id = account.user_id
on conflict (user_id) do update set
  account_email = excluded.account_email,
  full_name = excluded.full_name,
  requested_email = excluded.requested_email,
  status = 'connected',
  reviewed_at = excluded.reviewed_at,
  review_note = excluded.review_note;

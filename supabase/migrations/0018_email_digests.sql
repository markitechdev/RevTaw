-- 0018_email_digests.sql
-- AI provider round: the daily study digest by email.
--
--   * email_digests: one row per student and local day, claimed before the
--     email is sent, so two overlapping scheduler runs (or a retry after a
--     timeout) never send the same digest twice. Resend's idempotency key is
--     the second guard. Written only by the scheduler (the server's secret
--     key); students can read their own rows.
--
-- The opt-in itself lives in profiles.preferences (notifications.digest),
-- next to the other notification settings.

create table public.email_digests (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  status text not null
    constraint email_digests_status_valid check (status in ('sending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 1
    constraint email_digests_attempts_range check (attempts between 0 and 10),
  error text constraint email_digests_error_length check (error is null or char_length(error) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_digests_pkey primary key (user_id, day)
);

create trigger email_digests_set_updated_at
  before update on public.email_digests
  for each row execute function public.set_updated_at();

comment on table public.email_digests is
  'Daily study digest emails: one row per student and local day, claimed before sending so nothing is sent twice.';

alter table public.email_digests enable row level security;
revoke all on public.email_digests from anon, authenticated;
grant select on public.email_digests to authenticated;
create policy "email_digests: owner can read" on public.email_digests
  for select to authenticated using ((select auth.uid()) = user_id);

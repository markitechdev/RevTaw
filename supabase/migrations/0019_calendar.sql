-- 0019_calendar.sql
-- AI provider round: optional Google Calendar sync.
--
--   * calendar_connections: one row per student who connected Google
--     Calendar, with the id of the "RevTaw Study" calendar RevTaw created and
--     the Google refresh token, encrypted by the server (AES-256-GCM, key in
--     CALENDAR_TOKEN_KEY, bound to the student's id). Only the server's
--     secret key writes it. Students can read their own connection's state
--     through a column grant that leaves the token out, so the token can
--     never reach a browser.
--
-- Events need no table: each planner activity and exam has a fixed Google
-- event id derived from its own id.

create table public.calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'google'
    constraint calendar_connections_provider_valid check (provider in ('google')),
  calendar_id text constraint calendar_connections_calendar_id_length check (char_length(calendar_id) <= 300),
  refresh_token text constraint calendar_connections_refresh_token_length check (char_length(refresh_token) <= 2000),
  scope text constraint calendar_connections_scope_length check (char_length(scope) <= 1000),
  status text not null default 'connected'
    constraint calendar_connections_status_valid check (status in ('connected', 'needs_reconnect', 'error')),
  last_synced_at timestamptz,
  last_error text constraint calendar_connections_last_error_length check (char_length(last_error) <= 300),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

comment on table public.calendar_connections is
  'Google Calendar connections: the RevTaw Study calendar id and an encrypted refresh token. Written only by the server.';
comment on column public.calendar_connections.refresh_token is
  'AES-256-GCM ciphertext ("v1:…") of the Google refresh token; never granted to students.';

alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated;
grant select (user_id, provider, calendar_id, status, last_synced_at, last_error, connected_at, updated_at)
  on public.calendar_connections to authenticated;
create policy "calendar_connections: owner can read" on public.calendar_connections
  for select to authenticated using ((select auth.uid()) = user_id);

-- 0010_gamification.sql
-- Phase 9: analytics and gamification (§23, §31).
--   * xp_events: an append-only ledger of experience points, one row per
--     source (an answered quiz attempt, a finished session, a mastered
--     concept, a reached goal, an active day) so awarding is idempotent and
--     the total, the level and the history all derive from it;
--   * achievements: badges and milestones the student has unlocked;
--   * notification_kind gains `achievement` and `level_up`.
--
-- Same ownership model as before: user_id defaults to auth.uid(), owner-only RLS.

alter type public.notification_kind add value if not exists 'achievement';
alter type public.notification_kind add value if not exists 'level_up';

-- The running XP total lives on the profile and is maintained by a trigger
-- on the ledger, so reading the level is one row and the ledger stays the
-- source of truth (append-only; nothing subtracts).
alter table public.profiles
  add column xp integer not null default 0 constraint profiles_xp_nonnegative check (xp >= 0);
comment on column public.profiles.xp is 'Total experience points (§31), kept in step with public.xp_events by trigger.';

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null constraint xp_events_source_check check (source in ('answers', 'session', 'reviews', 'mastered', 'goal', 'streak_day', 'achievement')),
  source_key text not null constraint xp_events_key_length check (char_length(source_key) between 1 and 160),
  points integer not null constraint xp_events_points_range check (points between 0 and 1000),
  label text constraint xp_events_label_length check (label is null or char_length(label) <= 160),
  created_at timestamptz not null default now(),
  constraint xp_events_user_key_unique unique (user_id, source_key)
);

create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);

comment on table public.xp_events is 'XP ledger (§31): one row per rewarded source; totals, levels and history derive from it. source_key makes every award idempotent.';

create or replace function public.apply_xp_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set xp = xp + new.points where id = new.user_id;
  return new;
end;
$$;

create trigger xp_events_apply
  after insert on public.xp_events
  for each row execute function public.apply_xp_event();

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null constraint achievements_key_length check (char_length(key) between 1 and 60),
  unlocked_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint achievements_user_key_unique unique (user_id, key)
);

create index achievements_user_idx on public.achievements (user_id, unlocked_at desc);

comment on table public.achievements is 'Unlocked badges and milestones (§31); the definitions (title, rule) live in the application.';

alter table public.xp_events enable row level security;
alter table public.achievements enable row level security;

revoke all on public.xp_events from anon;
revoke all on public.achievements from anon;

grant select, insert, update, delete on public.xp_events to authenticated;
grant select, insert, update, delete on public.achievements to authenticated;

create policy "xp_events: owner full access" on public.xp_events
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "achievements: owner full access" on public.achievements
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

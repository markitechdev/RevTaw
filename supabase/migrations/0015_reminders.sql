-- 0015_reminders.sql
-- UI phase §27–§29: reminders for planner activities.
--
--   * study_tasks gains a reminder setting: none, at the time, 10 or 30
--     minutes, 1 hour or 1 day before, or a custom number of minutes.
--   * reminders: the queue behind reminders. One row per activity with a
--     reminder; delivery is tracked per channel (in-app, email) so a reminder
--     is never delivered twice on the same channel. The scheduler claims due
--     rows with claim_due_reminders(), which only the server's secret key may
--     call.
--   * notification_kind gains `reminder` (not used in this migration, so the
--     new value is safe inside a transaction).
--
-- Architecture: planner activity → reminders row (scheduler) → notification
-- service (in-app row, browser notification while RevTaw is open) → email
-- provider (Resend or SMTP, configured only in server environment variables).

alter type public.notification_kind add value if not exists 'reminder';

alter table public.study_tasks
  add column reminder text not null default 'none',
  add column reminder_minutes integer;

alter table public.study_tasks
  add constraint study_tasks_reminder_valid
    check (reminder in ('none', 'at_time', '10m', '30m', '1h', '1d', 'custom')),
  add constraint study_tasks_reminder_minutes_range
    check (reminder_minutes is null or reminder_minutes between 0 and 20160),
  add constraint study_tasks_custom_reminder check (reminder <> 'custom' or reminder_minutes is not null),
  add constraint study_tasks_id_user_unique unique (id, user_id);

comment on column public.study_tasks.reminder is 'none | at_time | 10m | 30m | 1h | 1d | custom (reminder_minutes before the start).';

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  remind_at timestamptz not null,
  status text not null default 'pending'
    constraint reminders_status_valid check (status in ('pending', 'sent', 'cancelled')),
  in_app_sent_at timestamptz,
  email_sent_at timestamptz,
  email_attempts smallint not null default 0
    constraint reminders_email_attempts_range check (email_attempts between 0 and 10),
  email_error text constraint reminders_email_error_length check (email_error is null or char_length(email_error) <= 300),
  -- Set while a scheduler run works on the row, so overlapping runs skip it.
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_task_unique unique (task_id),
  constraint reminders_task_fk foreign key (task_id, user_id)
    references public.study_tasks (id, user_id) on delete cascade
);

create index reminders_due_idx on public.reminders (remind_at) where status = 'pending';
create index reminders_user_idx on public.reminders (user_id, remind_at);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

comment on table public.reminders is 'Reminder queue for planner activities (UI phase §27–§29): one row per activity, delivery tracked per channel.';

alter table public.reminders enable row level security;
revoke all on public.reminders from anon;
grant select, insert, update, delete on public.reminders to authenticated;
create policy "reminders: owner full access" on public.reminders
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The scheduler claims a batch of due reminders for five minutes. "skip
-- locked" plus claimed_until keeps two overlapping runs from taking the same
-- rows. Only the service role (the server's secret key) may call it.
create or replace function public.claim_due_reminders(batch_size integer default 50)
returns setof public.reminders
language sql
security invoker
set search_path = ''
as $$
  update public.reminders r
     set claimed_until = now() + interval '5 minutes'
   where r.id in (
     select id
       from public.reminders
      where status = 'pending'
        and remind_at <= now()
        and (claimed_until is null or claimed_until < now())
      order by remind_at
      limit greatest(1, least(coalesce(batch_size, 50), 200))
      for update skip locked
   )
  returning r.*;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

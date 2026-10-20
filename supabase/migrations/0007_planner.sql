-- 0007_planner.sql
-- Phase 7: exams with countdowns, generated study plans and their daily tasks
-- (the due-today system), scheduled 1-3-7-14 reviews, study goals and the
-- internal notification feed (§30, §32, §35).
--
-- Same ownership model as before: user_id defaults to auth.uid(), owner-only
-- RLS, composite (id, user_id) foreign keys so a row can never point at
-- another student's data.

-- Calendar dates ("today", "due today", streaks) depend on the student's time
-- zone. Captured from the browser; null means UTC.
alter table public.profiles
  add column timezone text
    constraint profiles_timezone_length check (timezone is null or char_length(timezone) between 1 and 64);
comment on column public.profiles.timezone is 'IANA time zone (e.g. Asia/Manila) used for "today" in the planner and streaks; null = UTC.';

create type public.exam_priority as enum ('low', 'normal', 'high');
create type public.plan_mode as enum ('exam', 'cram');
create type public.plan_status as enum ('active', 'completed', 'archived');
create type public.task_kind as enum ('plan', 'review', 'custom');
create type public.task_status as enum ('pending', 'done', 'skipped', 'missed');
create type public.goal_kind as enum ('focus_minutes', 'flashcards_reviewed', 'questions_answered', 'mastery', 'finish_material');
create type public.goal_period as enum ('day', 'week', 'once');
create type public.goal_status as enum ('active', 'completed', 'archived');
create type public.notification_kind as enum ('review_due', 'exam_upcoming', 'plan_reminder', 'plan_adjusted', 'daily_goal', 'streak');

-- exams: what the student is preparing for.
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null constraint exams_title_length check (char_length(title) between 1 and 120),
  exam_date date not null,
  priority public.exam_priority not null default 'normal',
  confidence public.confidence_level,
  topics text[] not null default '{}' constraint exams_topics_count check (cardinality(topics) <= 30),
  notes text constraint exams_notes_length check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_id_user_unique unique (id, user_id),
  constraint exams_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null
);

create index exams_user_date_idx on public.exams (user_id, exam_date);

create trigger exams_set_updated_at
  before update on public.exams
  for each row execute function public.set_updated_at();

-- exam_materials: the materials an exam covers (the plan is built from them).
create table public.exam_materials (
  exam_id uuid not null,
  material_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (exam_id, material_id),
  constraint exam_materials_exam_fk foreign key (exam_id, user_id)
    references public.exams (id, user_id) on delete cascade,
  constraint exam_materials_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create index exam_materials_material_idx on public.exam_materials (material_id);

-- study_plans: one generated plan per exam (regenerated in place).
create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id uuid not null,
  mode public.plan_mode not null default 'exam',
  status public.plan_status not null default 'active',
  start_date date not null,
  end_date date not null,
  available_days smallint[] not null default '{0,1,2,3,4,5,6}'
    constraint study_plans_days_count check (cardinality(available_days) between 1 and 7),
  minutes_per_day integer not null default 30
    constraint study_plans_minutes_range check (minutes_per_day between 5 and 480),
  settings jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  adjusted_at timestamptz,
  adjustment_note text constraint study_plans_note_length check (adjustment_note is null or char_length(adjustment_note) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plans_id_user_unique unique (id, user_id),
  constraint study_plans_exam_unique unique (exam_id),
  constraint study_plans_exam_fk foreign key (exam_id, user_id)
    references public.exams (id, user_id) on delete cascade
);

create trigger study_plans_set_updated_at
  before update on public.study_plans
  for each row execute function public.set_updated_at();

-- study_tasks: one scheduled activity. Plan tasks come from the generator,
-- review tasks from the 1-3-7-14 cycle, custom tasks from the student.
create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid,
  exam_id uuid,
  material_id uuid,
  kind public.task_kind not null default 'plan',
  method text not null constraint study_tasks_method_length check (char_length(method) between 1 and 40),
  title text not null constraint study_tasks_title_length check (char_length(title) between 1 and 160),
  reason text constraint study_tasks_reason_length check (reason is null or char_length(reason) <= 400),
  scheduled_for date not null,
  position integer not null default 0,
  minutes integer not null default 15 constraint study_tasks_minutes_range check (minutes between 1 and 480),
  concepts text[] not null default '{}' constraint study_tasks_concepts_count check (cardinality(concepts) <= 12),
  status public.task_status not null default 'pending',
  session_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_tasks_plan_fk foreign key (plan_id, user_id)
    references public.study_plans (id, user_id) on delete cascade,
  constraint study_tasks_exam_fk foreign key (exam_id, user_id)
    references public.exams (id, user_id) on delete cascade,
  constraint study_tasks_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null,
  constraint study_tasks_session_fk foreign key (session_id, user_id)
    references public.study_sessions (id, user_id) on delete set null
);

create index study_tasks_user_day_idx on public.study_tasks (user_id, scheduled_for, status);
create index study_tasks_plan_idx on public.study_tasks (plan_id, scheduled_for, position);
create index study_tasks_material_idx on public.study_tasks (material_id) where material_id is not null;

create trigger study_tasks_set_updated_at
  before update on public.study_tasks
  for each row execute function public.set_updated_at();

comment on table public.study_tasks is 'Scheduled activities (§30, §53 planner tasks): plan-generated, 1-3-7-14 reviews or custom. Progress is tracked through session_id.';
comment on column public.study_tasks.method is 'Study method id from src/lib/study/methods.ts, or "review" for a plain scheduled review.';

-- study_goals: "study 60 minutes today", "complete 50 flashcards", "reach 80%
-- mastery", "finish chapter 4 before Friday" (§32). Progress is computed from
-- sessions, reviews, answers and mastery; nothing is double-counted here.
create table public.study_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.goal_kind not null,
  period public.goal_period not null default 'day',
  target integer not null constraint study_goals_target_range check (target between 1 and 100000),
  material_id uuid,
  subject_id uuid,
  title text constraint study_goals_title_length check (title is null or char_length(title) <= 120),
  due_date date,
  status public.goal_status not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_goals_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade,
  constraint study_goals_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete cascade
);

create index study_goals_user_status_idx on public.study_goals (user_id, status, created_at);

create trigger study_goals_set_updated_at
  before update on public.study_goals
  for each row execute function public.set_updated_at();

-- notifications: internal reminder feed (§35). Rows are generated server-side
-- with a dedupe key so a reminder is created once; delivery channels (email,
-- push) can read the same rows later.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null constraint notifications_title_length check (char_length(title) between 1 and 160),
  body text constraint notifications_body_length check (body is null or char_length(body) <= 600),
  href text constraint notifications_href_length check (href is null or char_length(href) <= 300),
  dedupe_key text not null constraint notifications_key_length check (char_length(dedupe_key) between 1 and 120),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_user_key_unique unique (user_id, dedupe_key)
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Row-level security: owner only.
alter table public.exams enable row level security;
alter table public.exam_materials enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_goals enable row level security;
alter table public.notifications enable row level security;

revoke all on public.exams from anon;
revoke all on public.exam_materials from anon;
revoke all on public.study_plans from anon;
revoke all on public.study_tasks from anon;
revoke all on public.study_goals from anon;
revoke all on public.notifications from anon;

grant select, insert, update, delete on public.exams to authenticated;
grant select, insert, update, delete on public.exam_materials to authenticated;
grant select, insert, update, delete on public.study_plans to authenticated;
grant select, insert, update, delete on public.study_tasks to authenticated;
grant select, insert, update, delete on public.study_goals to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

create policy "exams: owner full access" on public.exams
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exam_materials: owner full access" on public.exam_materials
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_plans: owner full access" on public.study_plans
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_tasks: owner full access" on public.study_tasks
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_goals: owner full access" on public.study_goals
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notifications: owner full access" on public.notifications
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

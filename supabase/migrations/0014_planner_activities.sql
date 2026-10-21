-- 0014_planner_activities.sql
-- UI phase §26: the planner calendar. A study task becomes a calendar
-- activity with a start time (local wall time in the student's time zone;
-- null = any time that day), a subject, a priority, notes and a category.
-- Plan and review tasks keep working unchanged: every new column is
-- optional or has a default.

alter table public.study_tasks
  add column starts_at time,
  add column subject_id uuid,
  add column priority public.exam_priority not null default 'normal',
  add column notes text,
  add column category text;

alter table public.study_tasks
  add constraint study_tasks_notes_length check (notes is null or char_length(notes) <= 2000),
  add constraint study_tasks_category_valid
    check (category is null or category in ('study', 'review', 'assignment', 'project', 'exam', 'class', 'other')),
  add constraint study_tasks_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id);

create index study_tasks_subject_idx on public.study_tasks (subject_id) where subject_id is not null;

comment on column public.study_tasks.starts_at is 'Local start time in the student''s time zone (profiles.timezone); null = any time that day.';
comment on column public.study_tasks.category is 'Calendar category of an activity; null for generated tasks (plan → study, review → review).';

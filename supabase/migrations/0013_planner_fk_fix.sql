-- 0013_planner_fk_fix.sql
-- Fix: three planner foreign keys from 0007 used a plain "on delete set null"
-- on a composite (id, user_id) key, so deleting the referenced row tried to
-- null user_id as well and failed. In practice a material with scheduled
-- reviews or planned tasks, or a subject used by an exam, could not be
-- deleted. Only the referencing id column is cleared now, like everywhere
-- else in the schema (PostgreSQL 15+ column lists).

alter table public.exams
  drop constraint exams_subject_fk,
  add constraint exams_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id);

alter table public.study_tasks
  drop constraint study_tasks_material_fk,
  add constraint study_tasks_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null (material_id);

alter table public.study_tasks
  drop constraint study_tasks_session_fk,
  add constraint study_tasks_session_fk foreign key (session_id, user_id)
    references public.study_sessions (id, user_id) on delete set null (session_id);

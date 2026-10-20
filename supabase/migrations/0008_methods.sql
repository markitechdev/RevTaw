-- 0008_methods.sql
-- Phase 8 (part 1): session items for the remaining study methods
-- (blurting, chunking, question generation, retrieval formats, problems,
-- scenarios, cases, guided-reading stages), items that belong to one material
-- inside a multi-material session (interleaving, cumulative review), the
-- teach-back tutor mode and saved custom study routines.

alter table public.study_session_items drop constraint study_session_items_kind_check;
alter table public.study_session_items add constraint study_session_items_kind_check
  check (kind in ('recall', 'feynman', 'mistake', 'blurt', 'chunk', 'question', 'problem', 'scenario', 'case', 'stage'));

-- Retrieval-practice format (short_answer, definition, fill_blank, explanation,
-- list, example, process, calculation) or a method-specific sub-kind.
alter table public.study_session_items
  add column format text constraint study_session_items_format_length check (format is null or char_length(format) <= 40);

-- Which material an item came from when a session mixes several.
alter table public.study_session_items add column material_id uuid;
alter table public.study_session_items add constraint study_session_items_material_fk
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id);
create index study_session_items_material_idx on public.study_session_items (material_id) where material_id is not null;

comment on column public.study_session_items.format is 'Retrieval format or method sub-kind (e.g. definition, list, calculation; faded_90).';
comment on column public.study_session_items.material_id is 'Source material of the item in interleaving / cumulative sessions; null when the session has one material.';

-- Teach-back: the AI plays the learner and the student teaches.
alter type public.tutor_mode add value if not exists 'teach_back';

-- routines: reusable combinations of methods ("My Exam Routine").
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null constraint routines_title_length check (char_length(title) between 1 and 120),
  description text constraint routines_description_length check (description is null or char_length(description) <= 400),
  blocks jsonb not null default '[]'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routines_user_idx on public.routines (user_id, updated_at desc);

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

comment on table public.routines is 'Custom study routines (§16): ordered blocks {method, minutes, materialId?, questionCount?} started as one combined session.';

alter table public.routines enable row level security;
revoke all on public.routines from anon;
grant select, insert, update, delete on public.routines to authenticated;
create policy "routines: owner full access" on public.routines
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 0003_reviewers_quizzes.sql
-- Phase 3: concepts, generated reviewers with editable sections, quizzes with
-- questions, attempts, answers and the mistake notebook.
--
-- Same ownership model as 0002: user_id defaults to auth.uid(), owner-only RLS,
-- and composite (id, user_id) foreign keys so rows can only reference the
-- student's own materials, reviewers, quizzes and concepts.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.reviewer_kind as enum (
  'complete',
  'summary',
  'bullet_notes',
  'key_concepts',
  'definitions',
  'formula_sheet',
  'qa',
  'cornell',
  'cheat_sheet',
  'exam_reviewer'
);

create type public.generation_status as enum ('generating', 'ready', 'failed');

create type public.question_type as enum (
  'identification',
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'essay',
  'scenario',
  'case_based',
  'problem_solving'
);

create type public.question_difficulty as enum ('easy', 'medium', 'hard');

create type public.quiz_mode as enum ('practice', 'exam');

create type public.attempt_status as enum ('in_progress', 'submitted');

create type public.confidence_level as enum ('guessing', 'unsure', 'somewhat_confident', 'very_confident');

create type public.mistake_type as enum (
  'misunderstood_concept',
  'forgotten_information',
  'calculation_error',
  'misread_question',
  'confused_concepts',
  'unclassified'
);

-- ---------------------------------------------------------------------------
-- concepts: the master concept model (§56). One row per distinct concept name
-- per student; questions, mistakes and later mastery records point here.
-- ---------------------------------------------------------------------------
create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  material_id uuid,
  name text not null constraint concepts_name_length check (char_length(name) between 1 and 120),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concepts_id_user_unique unique (id, user_id),
  constraint concepts_user_name_unique unique (user_id, normalized_name),
  constraint concepts_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint concepts_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null (material_id)
);

create index concepts_user_idx on public.concepts (user_id, normalized_name);
create index concepts_material_idx on public.concepts (material_id);

create trigger concepts_set_updated_at
  before update on public.concepts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reviewers + reviewer_sections: generated study notes, editable per section
-- ---------------------------------------------------------------------------
create table public.reviewers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null,
  kind public.reviewer_kind not null,
  title text not null constraint reviewers_title_length check (char_length(title) between 1 and 160),
  status public.generation_status not null default 'generating',
  status_detail text constraint reviewers_status_detail_length check (char_length(status_detail) <= 500),
  provider text,
  model text,
  last_opened_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviewers_id_user_unique unique (id, user_id),
  constraint reviewers_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create index reviewers_user_recent_idx on public.reviewers (user_id, archived_at, updated_at desc);
create index reviewers_material_idx on public.reviewers (material_id, kind);

create trigger reviewers_set_updated_at
  before update on public.reviewers
  for each row execute function public.set_updated_at();

create table public.reviewer_sections (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null constraint reviewer_sections_position_nonnegative check (position >= 0),
  heading text not null constraint reviewer_sections_heading_length check (char_length(heading) between 1 and 200),
  content text not null constraint reviewer_sections_content_length check (char_length(content) <= 20000),
  edited_at timestamptz,
  regenerated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviewer_sections_reviewer_fk foreign key (reviewer_id, user_id)
    references public.reviewers (id, user_id) on delete cascade,
  constraint reviewer_sections_reviewer_position_unique unique (reviewer_id, position)
);

create index reviewer_sections_reviewer_idx on public.reviewer_sections (reviewer_id, position);

create trigger reviewer_sections_set_updated_at
  before update on public.reviewer_sections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quizzes + quiz_questions
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null,
  title text not null constraint quizzes_title_length check (char_length(title) between 1 and 160),
  config jsonb not null default '{}'::jsonb,
  status public.generation_status not null default 'generating',
  status_detail text constraint quizzes_status_detail_length check (char_length(status_detail) <= 500),
  provider text,
  model text,
  question_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quizzes_id_user_unique unique (id, user_id),
  constraint quizzes_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create index quizzes_user_recent_idx on public.quizzes (user_id, archived_at, updated_at desc);
create index quizzes_material_idx on public.quizzes (material_id);

create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

comment on column public.quizzes.config is
  'Generation settings: question types, count, difficulty, mode, time limit, randomization, feedback timing.';

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null constraint quiz_questions_position_nonnegative check (position >= 0),
  type public.question_type not null,
  difficulty public.question_difficulty not null default 'medium',
  prompt text not null constraint quiz_questions_prompt_length check (char_length(prompt) between 1 and 4000),
  options jsonb,
  answer jsonb not null,
  explanation text constraint quiz_questions_explanation_length check (char_length(explanation) <= 4000),
  concept_id uuid,
  source_excerpt text constraint quiz_questions_source_length check (char_length(source_excerpt) <= 1000),
  source_chunk_id uuid references public.material_chunks (id) on delete set null,
  points integer not null default 1 constraint quiz_questions_points_range check (points between 1 and 10),
  created_at timestamptz not null default now(),
  constraint quiz_questions_id_user_unique unique (id, user_id),
  constraint quiz_questions_quiz_fk foreign key (quiz_id, user_id)
    references public.quizzes (id, user_id) on delete cascade,
  constraint quiz_questions_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete set null (concept_id),
  constraint quiz_questions_quiz_position_unique unique (quiz_id, position)
);

create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);
create index quiz_questions_concept_idx on public.quiz_questions (concept_id);

comment on column public.quiz_questions.options is
  'Multiple choice: [{"id": "a", "text": "..."}]. Null for other types.';
comment on column public.quiz_questions.answer is
  'Correct answer by type: {"option_id"}, {"value": true/false}, {"accepted": [...]} or {"model_answer", "rubric": [...]}.';

-- ---------------------------------------------------------------------------
-- quiz_attempts + quiz_answers
-- ---------------------------------------------------------------------------
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode public.quiz_mode not null default 'practice',
  status public.attempt_status not null default 'in_progress',
  time_limit_seconds integer constraint quiz_attempts_time_limit_range check (time_limit_seconds is null or time_limit_seconds between 30 and 14400),
  question_order jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(6, 2),
  max_score numeric(6, 2),
  correct_count integer,
  question_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_attempts_id_user_unique unique (id, user_id),
  constraint quiz_attempts_quiz_fk foreign key (quiz_id, user_id)
    references public.quizzes (id, user_id) on delete cascade
);

create index quiz_attempts_user_recent_idx on public.quiz_attempts (user_id, started_at desc);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id, started_at desc);

create trigger quiz_attempts_set_updated_at
  before update on public.quiz_attempts
  for each row execute function public.set_updated_at();

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  question_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  response jsonb,
  is_correct boolean,
  score numeric(5, 2),
  feedback text constraint quiz_answers_feedback_length check (char_length(feedback) <= 4000),
  graded_by text constraint quiz_answers_graded_by_check check (graded_by in ('auto', 'ai', 'self')),
  confidence public.confidence_level,
  response_ms integer constraint quiz_answers_response_ms_range check (response_ms is null or response_ms between 0 and 86400000),
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_answers_attempt_fk foreign key (attempt_id, user_id)
    references public.quiz_attempts (id, user_id) on delete cascade,
  constraint quiz_answers_question_fk foreign key (question_id, user_id)
    references public.quiz_questions (id, user_id) on delete cascade,
  constraint quiz_answers_attempt_question_unique unique (attempt_id, question_id)
);

create index quiz_answers_question_idx on public.quiz_answers (question_id, answered_at desc);
create index quiz_answers_user_idx on public.quiz_answers (user_id, answered_at desc);

create trigger quiz_answers_set_updated_at
  before update on public.quiz_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mistakes: the mistake notebook (§16 Error-Based Learning)
-- ---------------------------------------------------------------------------
create table public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid,
  attempt_id uuid,
  concept_id uuid,
  material_id uuid,
  question_text text not null constraint mistakes_question_length check (char_length(question_text) <= 4000),
  student_answer text constraint mistakes_student_answer_length check (char_length(student_answer) <= 4000),
  correct_answer text not null constraint mistakes_correct_answer_length check (char_length(correct_answer) <= 4000),
  explanation text constraint mistakes_explanation_length check (char_length(explanation) <= 4000),
  error_type public.mistake_type not null default 'unclassified',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mistakes_question_fk foreign key (question_id, user_id)
    references public.quiz_questions (id, user_id) on delete set null (question_id),
  constraint mistakes_attempt_fk foreign key (attempt_id, user_id)
    references public.quiz_attempts (id, user_id) on delete set null (attempt_id),
  constraint mistakes_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete set null (concept_id),
  constraint mistakes_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null (material_id)
);

create index mistakes_user_recent_idx on public.mistakes (user_id, resolved_at, created_at desc);
create index mistakes_concept_idx on public.mistakes (concept_id);

create trigger mistakes_set_updated_at
  before update on public.mistakes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------
alter table public.concepts enable row level security;
alter table public.reviewers enable row level security;
alter table public.reviewer_sections enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.mistakes enable row level security;

revoke all on public.concepts, public.reviewers, public.reviewer_sections, public.quizzes,
  public.quiz_questions, public.quiz_attempts, public.quiz_answers, public.mistakes from anon;
grant select, insert, update, delete on public.concepts, public.reviewers, public.reviewer_sections,
  public.quizzes, public.quiz_questions, public.quiz_attempts, public.quiz_answers, public.mistakes
  to authenticated;

create policy "concepts: owner full access" on public.concepts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviewers: owner full access" on public.reviewers
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviewer_sections: owner full access" on public.reviewer_sections
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quizzes: owner full access" on public.quizzes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quiz_questions: owner full access" on public.quiz_questions
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quiz_attempts: owner full access" on public.quiz_attempts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quiz_answers: owner full access" on public.quiz_answers
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mistakes: owner full access" on public.mistakes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 0004_study.sql
-- Phase 4: study sessions (builder, Pomodoro, active recall, Feynman, practice
-- testing, error review), flashcard decks with spaced-repetition state and the
-- review log that feeds "Flashcards due", streaks and focus time.
--
-- Same ownership model as 0002/0003: user_id defaults to auth.uid(), owner-only
-- RLS, composite (id, user_id) foreign keys.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.session_status as enum ('in_progress', 'completed', 'abandoned');

create type public.session_goal as enum (
  'memorize',
  'understand',
  'practice',
  'exam_prep',
  'quick_review',
  'master_topic'
);

create type public.flashcard_rating as enum ('again', 'hard', 'good', 'easy');

-- ---------------------------------------------------------------------------
-- study_sessions: one row per study session of any method. `state` holds the
-- method-specific progress so a refresh restores the session (§53); `summary`
-- is filled when the session completes (§29).
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid,
  subject_id uuid,
  method text not null constraint study_sessions_method_length check (char_length(method) between 1 and 40),
  goal public.session_goal,
  planned_minutes integer constraint study_sessions_planned_range check (planned_minutes is null or planned_minutes between 1 and 480),
  title text not null constraint study_sessions_title_length check (char_length(title) between 1 and 160),
  status public.session_status not null default 'in_progress',
  state jsonb not null default '{}'::jsonb,
  summary jsonb,
  focus_seconds integer not null default 0 constraint study_sessions_focus_nonnegative check (focus_seconds >= 0),
  items_total integer not null default 0,
  items_correct integer not null default 0,
  items_incorrect integer not null default 0,
  quiz_attempt_id uuid,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_sessions_id_user_unique unique (id, user_id),
  constraint study_sessions_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null (material_id),
  constraint study_sessions_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint study_sessions_attempt_fk foreign key (quiz_attempt_id, user_id)
    references public.quiz_attempts (id, user_id) on delete set null (quiz_attempt_id)
);

create index study_sessions_user_active_idx on public.study_sessions (user_id, status, last_active_at desc);
create index study_sessions_user_completed_idx on public.study_sessions (user_id, completed_at desc);
create index study_sessions_material_idx on public.study_sessions (material_id);

create trigger study_sessions_set_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

comment on column public.study_sessions.method is 'Study method id from src/lib/study/methods.ts (active_recall, flashcards, feynman, practice_testing, pomodoro, error_review, spaced_repetition, …).';
comment on column public.study_sessions.state is 'Method-specific progress used to restore the session after a refresh.';
comment on column public.study_sessions.summary is 'Session summary (§29): duration, items, accuracy, improvement, weak/strong concepts, next activity, next review.';

-- ---------------------------------------------------------------------------
-- study_session_items: the prompts a session works through (recall questions,
-- Feynman concepts, retested mistakes) with the student's response and the
-- AI's comparison.
-- ---------------------------------------------------------------------------
-- mistakes need a composite key so items can reference the student's own entries
alter table public.mistakes add constraint mistakes_id_user_unique unique (id, user_id);

create table public.study_session_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  position integer not null constraint study_session_items_position_nonnegative check (position >= 0),
  kind text not null constraint study_session_items_kind_check check (kind in ('recall', 'feynman', 'mistake')),
  concept_id uuid,
  prompt text not null constraint study_session_items_prompt_length check (char_length(prompt) between 1 and 4000),
  model_answer text constraint study_session_items_model_length check (char_length(model_answer) <= 4000),
  key_points jsonb not null default '[]'::jsonb,
  source_excerpt text constraint study_session_items_source_length check (char_length(source_excerpt) <= 1000),
  source_mistake_id uuid,
  response text constraint study_session_items_response_length check (char_length(response) <= 8000),
  analysis jsonb,
  is_correct boolean,
  score numeric(5, 2),
  confidence public.confidence_level,
  response_ms integer constraint study_session_items_response_ms_range check (response_ms is null or response_ms between 0 and 86400000),
  attempts integer not null default 0,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_session_items_session_fk foreign key (session_id, user_id)
    references public.study_sessions (id, user_id) on delete cascade,
  constraint study_session_items_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete set null (concept_id),
  constraint study_session_items_mistake_fk foreign key (source_mistake_id, user_id)
    references public.mistakes (id, user_id) on delete set null (source_mistake_id),
  constraint study_session_items_session_position_unique unique (session_id, position)
);

create index study_session_items_session_idx on public.study_session_items (session_id, position);
create index study_session_items_concept_idx on public.study_session_items (concept_id);

create trigger study_session_items_set_updated_at
  before update on public.study_session_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- flashcard_decks + flashcards: generated cards with Leitner box and SM-2
-- style scheduling state on each card.
-- ---------------------------------------------------------------------------
create table public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null,
  title text not null constraint flashcard_decks_title_length check (char_length(title) between 1 and 160),
  status public.generation_status not null default 'generating',
  status_detail text constraint flashcard_decks_status_detail_length check (char_length(status_detail) <= 500),
  provider text,
  model text,
  card_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcard_decks_id_user_unique unique (id, user_id),
  constraint flashcard_decks_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create index flashcard_decks_user_recent_idx on public.flashcard_decks (user_id, archived_at, updated_at desc);
create index flashcard_decks_material_idx on public.flashcard_decks (material_id);

create trigger flashcard_decks_set_updated_at
  before update on public.flashcard_decks
  for each row execute function public.set_updated_at();

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null,
  position integer not null constraint flashcards_position_nonnegative check (position >= 0),
  front text not null constraint flashcards_front_length check (char_length(front) between 1 and 2000),
  back text not null constraint flashcards_back_length check (char_length(back) between 1 and 4000),
  hint text constraint flashcards_hint_length check (char_length(hint) <= 500),
  concept_id uuid,
  source_excerpt text constraint flashcards_source_length check (char_length(source_excerpt) <= 1000),
  favorite boolean not null default false,
  suspended boolean not null default false,
  box smallint not null default 1 constraint flashcards_box_range check (box between 1 and 5),
  ease numeric(4, 2) not null default 2.50 constraint flashcards_ease_range check (ease between 1.30 and 4.00),
  interval_days integer not null default 0 constraint flashcards_interval_nonnegative check (interval_days >= 0),
  repetitions integer not null default 0,
  lapses integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_rating public.flashcard_rating,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcards_id_user_unique unique (id, user_id),
  constraint flashcards_deck_fk foreign key (deck_id, user_id)
    references public.flashcard_decks (id, user_id) on delete cascade,
  constraint flashcards_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete set null (concept_id),
  constraint flashcards_deck_position_unique unique (deck_id, position)
);

create index flashcards_deck_idx on public.flashcards (deck_id, position);
create index flashcards_due_idx on public.flashcards (user_id, due_at) where suspended = false;
create index flashcards_concept_idx on public.flashcards (concept_id);

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row execute function public.set_updated_at();

comment on column public.flashcards.box is 'Leitner box: 1 difficult, 2 learning, 3 familiar, 4 strong, 5 mastered.';

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  session_id uuid,
  rating public.flashcard_rating not null,
  response_ms integer constraint flashcard_reviews_response_ms_range check (response_ms is null or response_ms between 0 and 86400000),
  box_before smallint,
  box_after smallint,
  interval_days integer,
  due_at timestamptz,
  reviewed_at timestamptz not null default now(),
  constraint flashcard_reviews_card_fk foreign key (card_id, user_id)
    references public.flashcards (id, user_id) on delete cascade,
  constraint flashcard_reviews_session_fk foreign key (session_id, user_id)
    references public.study_sessions (id, user_id) on delete set null (session_id)
);

create index flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at desc);
create index flashcard_reviews_card_idx on public.flashcard_reviews (card_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------
alter table public.study_sessions enable row level security;
alter table public.study_session_items enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;

revoke all on public.study_sessions, public.study_session_items, public.flashcard_decks,
  public.flashcards, public.flashcard_reviews from anon;
grant select, insert, update, delete on public.study_sessions, public.study_session_items,
  public.flashcard_decks, public.flashcards, public.flashcard_reviews to authenticated;

create policy "study_sessions: owner full access" on public.study_sessions
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_session_items: owner full access" on public.study_session_items
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "flashcard_decks: owner full access" on public.flashcard_decks
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "flashcards: owner full access" on public.flashcards
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "flashcard_reviews: owner full access" on public.flashcard_reviews
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 0022_learning_engine.sql
-- Learning engine round (research doc "RevTaw Learning Intelligence Stack",
-- §7–§10): BKT × FSRS mastery, Elo difficulty and FSRS flashcards.
--
--   * mastery_status gains 'developing' (60–79%) between learning and
--     strong; 'weak' is shown as Needs Foundation.
--   * concept_mastery keeps the engine's estimates beside the existing
--     columns: P(learned), today's recall, the concept's Elo rating and
--     where it started, the weakness score, which evidence gates are met
--     and the next step, the highest state reached, and the concept's FSRS
--     state (one review per day). It stays a cache: every column except the
--     rating's starting point is recomputed from the evidence tables.
--   * flashcards keep their FSRS state (stability, difficulty, state,
--     learning step, scheduled days); flashcard_reviews log it. The SM-2
--     columns stay readable; Leitner boxes now come from stability. Cards
--     without an FSRS state are rebuilt from their review history on their
--     next review.
--   * item_buckets: shared question difficulty per difficulty label ×
--     question type × concept category, refit nightly from first attempts
--     across all students. Students can read it (it holds no personal
--     data); only the server's secret key writes it.

alter type public.mastery_status add value if not exists 'developing' before 'strong';

alter table public.concept_mastery
  add column p_learned numeric(5, 4) not null default 0
    constraint concept_mastery_p_learned_range check (p_learned between 0 and 1),
  add column recall numeric(5, 4)
    constraint concept_mastery_recall_range check (recall is null or recall between 0 and 1),
  add column elo_rating numeric(7, 4) not null default 0
    constraint concept_mastery_elo_rating_range check (elo_rating between -20 and 20),
  add column elo_answers integer not null default 0
    constraint concept_mastery_elo_answers_nonnegative check (elo_answers >= 0),
  add column elo_start numeric(7, 4)
    constraint concept_mastery_elo_start_range check (elo_start is null or elo_start between -20 and 20),
  add column weakness numeric(5, 4) not null default 0
    constraint concept_mastery_weakness_range check (weakness between 0 and 1),
  add column first_attempts integer not null default 0
    constraint concept_mastery_first_attempts_nonnegative check (first_attempts >= 0),
  add column gates jsonb not null default '{}'::jsonb
    constraint concept_mastery_gates_object check (jsonb_typeof(gates) = 'object'),
  add column next_step text
    constraint concept_mastery_next_step_valid check (next_step is null or next_step in ('evidence', 'noMisconception', 'hardItem', 'spaced')),
  add column best_status public.mastery_status,
  add column fsrs_stability numeric(10, 4)
    constraint concept_mastery_fsrs_stability_nonnegative check (fsrs_stability is null or fsrs_stability >= 0),
  add column fsrs_difficulty numeric(6, 4),
  add column fsrs_state smallint
    constraint concept_mastery_fsrs_state_range check (fsrs_state is null or fsrs_state between 0 and 3),
  add column fsrs_reps integer not null default 0,
  add column fsrs_lapses integer not null default 0,
  add column fsrs_last_review timestamptz;

comment on column public.concept_mastery.p_learned is 'Bayesian Knowledge Tracing: probability the concept is learned.';
comment on column public.concept_mastery.recall is 'FSRS recall probability today (concept reviewed once a day).';
comment on column public.concept_mastery.elo_rating is 'Elo ability on this concept, in logits (student ability + concept offset).';
comment on column public.concept_mastery.elo_start is 'Where the concept''s rating starts: the student''s ability when it was first answered. Kept, so replaying the history never drifts.';
comment on column public.concept_mastery.weakness is 'Weakness score W (0–1); weak from 0.30.';
comment on column public.concept_mastery.gates is 'Evidence gates met: evidence (3+ answers), hardItem, noMisconception, spaced.';
comment on column public.concept_mastery.next_step is 'The unmet gate that caps mastery now.';
comment on column public.concept_mastery.best_status is 'Highest state reached; a drop from forgetting is shown as a refresh.';
comment on column public.concept_mastery.misconceptions is 'Open misconceptions: confident wrong answers not yet cleared by a correct answer on a later day.';

alter table public.flashcards
  add column fsrs_stability numeric(10, 4)
    constraint flashcards_fsrs_stability_nonnegative check (fsrs_stability is null or fsrs_stability >= 0),
  add column fsrs_difficulty numeric(6, 4),
  add column fsrs_state smallint
    constraint flashcards_fsrs_state_range check (fsrs_state is null or fsrs_state between 0 and 3),
  add column fsrs_learning_steps integer not null default 0
    constraint flashcards_fsrs_learning_steps_nonnegative check (fsrs_learning_steps >= 0),
  add column fsrs_scheduled_days integer not null default 0
    constraint flashcards_fsrs_scheduled_days_nonnegative check (fsrs_scheduled_days >= 0);

comment on column public.flashcards.fsrs_stability is 'FSRS stability in days; null until the card is scheduled by FSRS (its history is then replayed).';
comment on column public.flashcards.box is 'Leitner view of FSRS stability: 1 under 1 day, 2 at 1–3, 3 at 3–7, 4 at 7–21, 5 beyond.';

alter table public.flashcard_reviews
  add column fsrs_state smallint
    constraint flashcard_reviews_fsrs_state_range check (fsrs_state is null or fsrs_state between 0 and 3),
  add column stability numeric(10, 4),
  add column difficulty numeric(6, 4),
  add column retrievability numeric(5, 4)
    constraint flashcard_reviews_retrievability_range check (retrievability is null or retrievability between 0 and 1);

comment on column public.flashcard_reviews.retrievability is 'FSRS recall probability just before this review (null for a new card).';

create table public.item_buckets (
  bucket_key text primary key
    constraint item_buckets_key_format check (bucket_key ~ '^(easy|medium|hard):[a-z_]{1,40}:[a-z_]{1,40}$'),
  difficulty numeric(6, 3) not null default 0
    constraint item_buckets_difficulty_range check (difficulty between -4 and 4),
  answers integer not null default 0
    constraint item_buckets_answers_nonnegative check (answers >= 0),
  refit_at timestamptz not null default now()
);

comment on table public.item_buckets is
  'Elo difficulty (logits) per difficulty label × question type × concept category, refit nightly from first attempts across all students.';

alter table public.item_buckets enable row level security;
revoke all on public.item_buckets from anon, authenticated;
grant select on public.item_buckets to authenticated;
grant select, insert, update, delete on public.item_buckets to service_role;
create policy "item_buckets: readable by signed-in students" on public.item_buckets
  for select to authenticated using (true);

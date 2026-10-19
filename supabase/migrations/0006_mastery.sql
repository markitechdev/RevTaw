-- 0006_mastery.sql
-- Phase 6: the adaptive engine's cached view of each concept — mastery,
-- retrieval strength, confidence calibration, next difficulty and next review
-- — recomputed from quiz answers, session items, flashcard reviews and the
-- mistake notebook whenever new evidence arrives.
--
-- Same ownership model as before: user_id defaults to auth.uid(), owner-only
-- RLS, composite (id, user_id) foreign keys.

create type public.mastery_status as enum ('new', 'weak', 'learning', 'strong', 'mastered');

create type public.next_difficulty as enum ('easy', 'medium', 'hard', 'advanced');

create table public.concept_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  concept_id uuid not null,
  mastery numeric(5, 2) not null default 0 constraint concept_mastery_mastery_range check (mastery between 0 and 100),
  retrieval_strength numeric(5, 2) not null default 0 constraint concept_mastery_strength_range check (retrieval_strength between 0 and 100),
  status public.mastery_status not null default 'new',
  next_difficulty public.next_difficulty not null default 'easy',
  attempts integer not null default 0,
  correct integer not null default 0,
  incorrect integer not null default 0,
  streak integer not null default 0,
  open_mistakes integer not null default 0,
  misconceptions integer not null default 0,
  underconfident integer not null default 0,
  avg_confidence numeric(4, 2),
  avg_response_ms integer,
  trend numeric(6, 2) not null default 0,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concept_mastery_user_concept_unique unique (user_id, concept_id),
  constraint concept_mastery_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete cascade
);

create index concept_mastery_user_status_idx on public.concept_mastery (user_id, status, mastery);
create index concept_mastery_user_review_idx on public.concept_mastery (user_id, next_review_at);

create trigger concept_mastery_set_updated_at
  before update on public.concept_mastery
  for each row execute function public.set_updated_at();

comment on table public.concept_mastery is
  'Adaptive engine cache (§28): recomputed from evidence tables; never the only copy of any fact.';
comment on column public.concept_mastery.misconceptions is 'Wrong answers given with high confidence.';
comment on column public.concept_mastery.underconfident is 'Correct answers given with low confidence.';

alter table public.concept_mastery enable row level security;
revoke all on public.concept_mastery from anon;
grant select, insert, update, delete on public.concept_mastery to authenticated;
create policy "concept_mastery: owner full access" on public.concept_mastery
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

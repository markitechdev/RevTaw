-- 0038_mastery_model_version.sql
-- Which version of the learning engine computed each mastery row.
--
--   * concept_mastery.model_version: 1 for rows written before this
--     migration (Bayesian Knowledge Tracing, or the model before it), 2 for
--     the knowledge-share model. RevTaw recomputes a student's mastery when
--     any practiced row is older than the running model, so nobody sees old
--     and new numbers side by side.
--   * p_learned now holds K, the share of the concept the student knows
--     (0 when every answer so far was at or below chance), so "0" no longer
--     marks a row from the old model.
--
-- The table's row-level security already covers the new column.

alter table public.concept_mastery
  add column if not exists model_version smallint not null default 1
    constraint concept_mastery_model_version_positive check (model_version >= 1);

comment on column public.concept_mastery.model_version is
  'Learning-engine version that computed the row (2: knowledge share). Older rows are recomputed on the next read.';
comment on column public.concept_mastery.p_learned is
  'K: the share of the concept the student knows, from guess- and slip-corrected answers (0–1).';

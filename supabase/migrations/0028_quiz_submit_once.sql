-- 0028_quiz_submit_once.sql
-- A quiz attempt is graded once.
--
--   * A deadline auto-submit, a reload or a second tab could submit the same
--     attempt together: each graded it (each open answer cost an AI request
--     twice), the totals could disagree with the per-question scores, and the
--     Mistake Notebook got duplicate entries.
--   * quiz_attempts.submit_started_at is set by the submission that takes the
--     attempt; another one waits for it instead of grading again. A claim
--     older than three minutes (a request that was cut off) may be taken over.
--   * mistakes gets one entry per question per attempt; existing duplicates
--     are removed (the earliest entry is kept).

alter table public.quiz_attempts add column submit_started_at timestamptz;

comment on column public.quiz_attempts.submit_started_at is
  'Set while a submission grades the attempt, so a second one waits instead of grading twice.';

delete from public.mistakes m
 using public.mistakes earlier
 where m.attempt_id = earlier.attempt_id
   and m.question_id = earlier.question_id
   and (earlier.created_at < m.created_at or (earlier.created_at = m.created_at and earlier.id < m.id));

alter table public.mistakes
  add constraint mistakes_attempt_question_unique unique (attempt_id, question_id);

-- 0035_study_grading.sql
-- How study and quiz answers are counted.
--
-- Answers Tamari couldn't check. When the AI is unavailable, a study answer is
-- saved without a grade (is_correct null) and the student marks it themselves
-- after comparing it with the model answer. Until then it counts as answered
-- but neither right nor wrong.
--
--   * count_session_answer(p_session_id, p_correct, p_index): a null
--     p_correct now adds to items_total only. It used to count as incorrect,
--     because "case when p_correct then 0 else 1 end" is 1 for null.
--   * count_session_grade(p_session_id, p_correct): counts the grade of an
--     answer already counted as answered (the student's own mark), without
--     adding to items_total. Only a session still in progress counts. Runs
--     with the caller's rights: a student counts only their own sessions.
--
-- Quiz questions left unanswered: bucket_first_attempts() skips them (below).

create or replace function public.count_session_answer(p_session_id uuid, p_correct boolean, p_index integer default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.study_sessions s
     set items_total = s.items_total + 1,
         items_correct = s.items_correct + case when p_correct is true then 1 else 0 end,
         items_incorrect = s.items_incorrect + case when p_correct is false then 1 else 0 end,
         state = case
           when p_index is null then s.state
           else jsonb_set(
             coalesce(s.state, '{}'::jsonb),
             '{index}',
             to_jsonb(greatest(p_index, case when jsonb_typeof(s.state -> 'index') = 'number' then (s.state ->> 'index')::numeric::integer else 0 end))
           )
         end,
         last_active_at = now()
   where s.id = p_session_id
     and s.status = 'in_progress';
$$;

comment on function public.count_session_answer(uuid, boolean, integer) is
  'Counts one answer in a study session in progress (a null p_correct: answered, not yet graded) and moves its resume index forward. Caller''s rights: students count only their own sessions.';

create or replace function public.count_session_grade(p_session_id uuid, p_correct boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.study_sessions s
     set items_correct = s.items_correct + case when p_correct then 1 else 0 end,
         items_incorrect = s.items_incorrect + case when p_correct then 0 else 1 end,
         last_active_at = now()
   where s.id = p_session_id
     and s.status = 'in_progress'
     and p_correct is not null;
$$;

comment on function public.count_session_grade(uuid, boolean) is
  'Counts the grade of an answer already counted by count_session_answer (the student''s own mark for an answer the AI could not check). Caller''s rights: students count only their own sessions.';

revoke all on function public.count_session_grade(uuid, boolean) from public, anon;
grant execute on function public.count_session_grade(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Quiz questions left unanswered
-- ---------------------------------------------------------------------------
-- A question left unanswered scores 0 in its attempt (stored with is_correct
-- false and no response) but says nothing about what the student knows: time
-- may have run out. The nightly difficulty refit now skips it. It still counts
-- as the question's first attempt, so a later answer, given after the results
-- showed the correct one, is not taken as a first attempt either.
-- Same signature and grants as in 0027.
create or replace function public.bucket_first_attempts(since timestamptz, per_student integer default 400, max_rows integer default 20000)
returns table (
  user_id uuid,
  question_id uuid,
  is_correct boolean,
  concept_id uuid,
  difficulty public.question_difficulty,
  question_type public.question_type,
  options jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with first_attempts as (
    select distinct on (a.user_id, a.question_id)
           a.user_id, a.question_id, a.is_correct, a.answered_at, a.response is not null as answered,
           q.concept_id, q.difficulty, q.type, q.options
      from public.quiz_answers a
      join public.quiz_questions q on q.id = a.question_id
     where a.is_correct is not null
       and q.concept_id is not null
       and a.answered_at >= since
       and a.answered_at <= now()
     order by a.user_id, a.question_id, a.answered_at, a.id
  ),
  latest as (
    select f.*, row_number() over (partition by f.user_id order by f.answered_at desc, f.question_id) as nth
      from first_attempts f
     where f.answered
  )
  select l.user_id, l.question_id, l.is_correct, l.concept_id, l.difficulty, l.type, l.options
    from latest l
   where l.nth <= greatest(1, coalesce(per_student, 400))
   order by l.answered_at desc, l.user_id, l.question_id
   limit greatest(1, least(coalesce(max_rows, 20000), 50000));
$$;

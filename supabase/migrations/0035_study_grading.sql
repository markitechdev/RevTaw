-- 0035_study_grading.sql
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

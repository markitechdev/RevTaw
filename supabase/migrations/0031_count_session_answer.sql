-- 0031_count_session_answer.sql
-- A study session's counters (items_total, items_correct, items_incorrect)
-- were read by the app, added to and written back, in three places: two
-- answers saved at the same moment (two tabs, a flashcard and a question)
-- could both read the same numbers, and one answer was lost.
--
--   * count_session_answer(p_session_id, p_correct, p_index): adds one answer
--     in a single statement, so every answer counts. With p_index it also
--     moves the session's resume point forward (never back), keeping the
--     rest of its state as it is. Only a session still in progress counts.
--     Runs with the caller's rights: a student counts only their own
--     sessions (row-level security).

create or replace function public.count_session_answer(p_session_id uuid, p_correct boolean, p_index integer default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.study_sessions s
     set items_total = s.items_total + 1,
         items_correct = s.items_correct + case when p_correct then 1 else 0 end,
         items_incorrect = s.items_incorrect + case when p_correct then 0 else 1 end,
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
  'Counts one answer in a study session in progress (and moves its resume index forward). Caller''s rights: students count only their own sessions.';

revoke all on function public.count_session_answer(uuid, boolean, integer) from public, anon;
grant execute on function public.count_session_answer(uuid, boolean, integer) to authenticated, service_role;

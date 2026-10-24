-- 0030_student_elo_totals.sql
-- Every graded answer recomputes the answered concept's mastery, and the
-- student's overall Elo ability (an answers-weighted mean over all their
-- concepts) used to be worked out by downloading every one of their mastery
-- rows, up to 10,000, for each answer.
--
--   * student_elo_totals(p_user_id): the two sums the ability needs, in one
--     row. Runs with the caller's rights, so a student only ever sums their
--     own rows (row-level security); the scheduler's secret key sums any
--     student's for the nightly run.

create or replace function public.student_elo_totals(p_user_id uuid)
returns table (weighted double precision, answers bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(m.elo_rating * m.elo_answers), 0)::double precision as weighted,
         coalesce(sum(m.elo_answers), 0)::bigint as answers
    from public.concept_mastery m
   where m.user_id = p_user_id
     and m.elo_answers > 0;
$$;

comment on function public.student_elo_totals(uuid) is
  'Sum of elo_rating × elo_answers and of elo_answers over a student''s concepts (their overall ability). Caller''s rights: students see only their own rows.';

revoke all on function public.student_elo_totals(uuid) from public, anon;
grant execute on function public.student_elo_totals(uuid) to authenticated, service_role;

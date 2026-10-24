-- 0029_nightly_students.sql
-- The nightly engine run recomputes stale mastery student by student. It
-- used to find those students in the first 1,000 stale mastery rows, so one
-- student with 1,000 stale concepts filled the whole read and everyone else
-- waited.
--
--   * stale_mastery_students(cutoff, max_students): each student with
--     practiced concepts computed before the cutoff, once, the one waiting
--     longest first. Server (secret key) only, like the other job functions.

create or replace function public.stale_mastery_students(cutoff timestamptz, max_students integer default 1000)
returns table (user_id uuid, oldest timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.user_id, min(m.computed_at) as oldest
    from public.concept_mastery m
   where m.attempts > 0
     and m.computed_at < cutoff
   group by m.user_id
   order by min(m.computed_at), m.user_id
   limit greatest(1, least(coalesce(max_students, 1000), 10000));
$$;

comment on function public.stale_mastery_students(timestamptz, integer) is
  'Students with practiced mastery computed before the cutoff, each once, longest-waiting first. Server (secret key) only.';

revoke all on function public.stale_mastery_students(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_mastery_students(timestamptz, integer) to service_role;

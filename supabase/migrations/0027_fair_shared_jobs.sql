-- 0027_fair_shared_jobs.sql
-- The scheduler's jobs run with the server's secret key over every student's
-- rows, and students can write some of those rows directly through the Data
-- API. These limits keep one account from using up what everyone shares.
--
--   * Reminders: a student can have at most 1,000 pending reminders, and
--     claim_due_reminders() takes at most 10 due reminders per student in a
--     batch (oldest first), so one student's backlog cannot hold back
--     everyone else's. The job also sends each student at most 20 reminder
--     emails a day (src/lib/reminders/service.ts).
--   * Search embeddings: chunk text is capped at 20,000 characters (RevTaw's
--     chunks stay under 5,000), and unembedded_chunks_fair() gives the
--     backfill job waiting chunks in turns across students, none for a
--     student whose chunks were embedded 1,000 times in the last day.
--   * Question difficulty: an answer saved by a student always carries the
--     time it was saved (no backdating), and bucket_first_attempts() gives the
--     nightly refit at most 400 first attempts per student.

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------
create or replace function public.reminders_limit_pending()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    if (select count(*) from public.reminders r where r.user_id = new.user_id and r.status = 'pending') >= 1000 then
      raise exception 'A student can have at most 1000 pending reminders' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger reminders_limit_pending
  before insert or update of status on public.reminders
  for each row execute function public.reminders_limit_pending();

-- Same signature and grants as in 0015; now fair across students.
create or replace function public.claim_due_reminders(batch_size integer default 50)
returns setof public.reminders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(picked.id)
    into v_ids
    from (
      select due.id
        from (
          select r.id, r.remind_at,
                 row_number() over (partition by r.user_id order by r.remind_at, r.id) as nth
            from public.reminders r
           where r.status = 'pending'
             and r.remind_at <= now()
             and (r.claimed_until is null or r.claimed_until < now())
        ) due
       where due.nth <= 10
       order by due.remind_at, due.id
       limit greatest(1, least(coalesce(batch_size, 50), 200))
    ) picked;

  return query
    update public.reminders r
       set claimed_until = now() + interval '5 minutes'
     where r.id in (
       select candidate.id
         from public.reminders candidate
        where candidate.id = any (coalesce(v_ids, '{}'::uuid[]))
          and candidate.status = 'pending'
          and (candidate.claimed_until is null or candidate.claimed_until < now())
        for update skip locked
     )
    returning r.*;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Search embeddings
-- ---------------------------------------------------------------------------
-- NOT VALID: enforced for every new or changed chunk without rechecking old rows.
alter table public.material_chunks
  add constraint material_chunks_content_length check (char_length(content) <= 20000) not valid;

create index material_chunks_unembedded_user_idx on public.material_chunks (user_id, material_id, position)
  where embedding is null;
create index material_chunks_embedded_recent_idx on public.material_chunks (user_id, embedded_at)
  where embedded_at is not null;

create or replace function public.unembedded_chunks_fair(batch_size integer default 20, daily_cap integer default 1000)
returns table (id uuid, user_id uuid, heading text, content text)
language sql
stable
security invoker
set search_path = ''
as $$
  with students as (
    select distinct c.user_id
      from public.material_chunks c
     where c.embedding is null
  ),
  allowance as (
    select s.user_id,
           greatest(0, least(greatest(1, least(coalesce(batch_size, 20), 200)), coalesce(daily_cap, 1000) - (
             select count(*)
               from public.material_chunks e
              where e.user_id = s.user_id
                and e.embedded_at > now() - interval '1 day'
           )::integer)) as remaining
      from students s
  ),
  picked as (
    select p.id, p.user_id, p.heading, p.content, p.nth
      from allowance a
      cross join lateral (
        select c.id, c.user_id, c.heading, c.content,
               row_number() over (order by c.material_id, c.position) as nth
          from public.material_chunks c
         where c.user_id = a.user_id
           and c.embedding is null
         order by c.material_id, c.position
         limit a.remaining
      ) p
     where a.remaining > 0
  )
  -- In turns: every student's first waiting chunk, then every student's second, and so on.
  select picked.id, picked.user_id, picked.heading, picked.content
    from picked
   order by picked.nth, picked.user_id
   limit greatest(1, least(coalesce(batch_size, 20), 200));
$$;

comment on function public.unembedded_chunks_fair(integer, integer) is
  'Waiting chunks for the embedding backfill, in turns across students; none for a student with daily_cap embeddings in the last day. Server (secret key) only.';

revoke all on function public.unembedded_chunks_fair(integer, integer) from public, anon, authenticated;
grant execute on function public.unembedded_chunks_fair(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Question difficulty
-- ---------------------------------------------------------------------------
-- Answers a student saves (directly or through RevTaw's server) carry the
-- time they were saved. The server's secret key and database maintenance
-- (seeds, imports) can still set other times.
create or replace function public.quiz_answers_stamp_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and (tg_op = 'INSERT' or new.answered_at is distinct from old.answered_at) then
    new.answered_at := now();
  end if;
  return new;
end;
$$;

create trigger quiz_answers_stamp_time
  before insert or update of answered_at on public.quiz_answers
  for each row execute function public.quiz_answers_stamp_time();

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
           a.user_id, a.question_id, a.is_correct, a.answered_at,
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
  )
  select l.user_id, l.question_id, l.is_correct, l.concept_id, l.difficulty, l.type, l.options
    from latest l
   where l.nth <= greatest(1, coalesce(per_student, 400))
   order by l.answered_at desc, l.user_id, l.question_id
   limit greatest(1, least(coalesce(max_rows, 20000), 50000));
$$;

comment on function public.bucket_first_attempts(timestamptz, integer, integer) is
  'First attempts since a time for the nightly difficulty refit, at most per_student per student (their latest). Server (secret key) only.';

revoke all on function public.bucket_first_attempts(timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.bucket_first_attempts(timestamptz, integer, integer) to service_role;

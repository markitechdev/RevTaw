-- 0032_drop_unused_columns.sql
-- Columns that nothing writes, so a reader can trust what the schema says.
--
--   * archived_at on subjects, folders, reviewers, quizzes, flashcard_decks
--     and tutor_conversations: every list filtered on it, but nothing ever
--     set it (these are deleted outright, with a confirmation). Only
--     materials (the Archive) and exams (archive an exam) are archived.
--   * study_goals.subject_id: goals are about a material or about study time;
--     no goal is ever saved with a subject.
--
-- Every value dropped here should be null; the check below stops (and changes
-- nothing) if one is not. The list indexes that led with
-- (user_id, archived_at, ...) are rebuilt on the columns the lists sort by.

do $$
declare
  target record;
  filled boolean;
  found text[] := '{}';
begin
  for target in
    select c.table_name, c.column_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and ((c.column_name = 'archived_at' and c.table_name in ('subjects', 'folders', 'reviewers', 'quizzes', 'flashcard_decks', 'tutor_conversations'))
         or (c.column_name = 'subject_id' and c.table_name = 'study_goals'))
  loop
    execute format('select exists (select 1 from public.%I where %I is not null)', target.table_name, target.column_name) into filled;
    if filled then
      found := found || (target.table_name || '.' || target.column_name);
    end if;
  end loop;
  if cardinality(found) > 0 then
    raise exception 'Nothing was dropped, because these columns have values: %. Clear them (or keep the columns) first.', array_to_string(found, ', ');
  end if;
end $$;

drop index if exists public.subjects_user_idx;
drop index if exists public.reviewers_user_recent_idx;
drop index if exists public.quizzes_user_recent_idx;
drop index if exists public.flashcard_decks_user_recent_idx;
drop index if exists public.tutor_conversations_user_recent_idx;

alter table public.subjects drop column if exists archived_at;
alter table public.folders drop column if exists archived_at;
alter table public.reviewers drop column if exists archived_at;
alter table public.quizzes drop column if exists archived_at;
alter table public.flashcard_decks drop column if exists archived_at;
alter table public.tutor_conversations drop column if exists archived_at;

create index if not exists subjects_user_idx on public.subjects (user_id, name);
create index if not exists reviewers_user_recent_idx on public.reviewers (user_id, updated_at desc);
create index if not exists quizzes_user_recent_idx on public.quizzes (user_id, updated_at desc);
create index if not exists flashcard_decks_user_recent_idx on public.flashcard_decks (user_id, updated_at desc);
create index if not exists tutor_conversations_user_recent_idx on public.tutor_conversations (user_id, last_message_at desc);

alter table public.study_goals drop constraint if exists study_goals_subject_fk;
alter table public.study_goals drop column if exists subject_id;

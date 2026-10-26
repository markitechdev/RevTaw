-- 0040_mistake_retests.sql
-- What a retest of a notebook mistake needs.
--
--   * mistakes.choices: the options of a question answered by picking one
--     (multiple choice, two statements, true or false), so its retest shows
--     them: "Which of these is NOT a product of photosynthesis?" can't be
--     answered without them.
--   * mistakes.context: what the question needs that isn't in it, such as a
--     case's text, or a scenario's situation and options.
--
-- Backfilled: the choices of quiz mistakes from their questions. The table's
-- row-level security already covers the new columns.

alter table public.mistakes
  add column if not exists choices jsonb,
  add column if not exists context text;

alter table public.mistakes drop constraint if exists mistakes_choices_shape;
alter table public.mistakes add constraint mistakes_choices_shape
  check (choices is null or (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 8));

alter table public.mistakes drop constraint if exists mistakes_context_length;
alter table public.mistakes add constraint mistakes_context_length
  check (char_length(context) <= 4000);

comment on column public.mistakes.choices is
  'Options of a question answered by picking one (multiple choice, two statements, true/false), in order; null otherwise.';
comment on column public.mistakes.context is
  'What the question needs that is not in it (a case''s text, a scenario''s situation and options); null when nothing.';

-- The choices of quiz mistakes made before this migration, from their questions (multiple choice and two
-- statements keep their options in quiz_questions.options; true/false is always True, False).
update public.mistakes m
   set choices = q.choices
  from (
    select question.id,
           case
             when question.type = 'true_false' then '["True", "False"]'::jsonb
             else (
               select jsonb_agg(option ->> 'text' order by position)
                 from jsonb_array_elements(question.options) with ordinality as listed (option, position)
                where coalesce(option ->> 'text', '') <> ''
             )
           end as choices
      from public.quiz_questions question
     where question.type in ('multiple_choice', 'two_statement', 'true_false')
       and (question.type = 'true_false' or jsonb_typeof(question.options) = 'array')
  ) q
 where m.question_id = q.id
   and m.choices is null
   and q.choices is not null
   and jsonb_array_length(q.choices) between 2 and 8;

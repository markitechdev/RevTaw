-- 0036_two_statement_questions.sql
-- Two-statement questions: the student reads two statements from the
-- material and decides which are true: only the first, only the second,
-- both, or neither. RevTaw writes the four choices itself, always in that
-- order, and grades the answer like a multiple-choice one.
--
-- Its own migration: a new enum value can't be used in the transaction that
-- adds it, and nothing here uses it.

alter type public.question_type add value if not exists 'two_statement' after 'true_false';

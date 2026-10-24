-- 0024_performance_indexes.sql
-- Indexes for the queries RevTaw runs most, found by checking every foreign
-- key and the hot query paths against the existing indexes.
--
--   * Row-level security adds `user_id = auth.uid()` to every query; tables
--     that were read across a student's rows without a parent id (session
--     items for the learning engine, chunks for Tamari's search, folders for
--     the sidebar) scanned every student's rows. Account deletion also
--     cascades by user_id through each of these tables.
--   * Foreign keys that clear their column when the parent goes (a deleted
--     chunk, question, attempt, mistake, session or folder) need an index on
--     that column, or each deleted parent row scans the whole child table:
--     deleting a material's text did one scan of quiz_questions per chunk.
--   * The night run pages through recent answers and stale mastery across
--     all students.
--   * Six indexes duplicated a unique index on the same columns; they only
--     slowed every insert down.
--
-- Plain CREATE INDEX (no CONCURRENTLY) so the file runs in one transaction;
-- each one takes a moment on a young database.

-- Read and deleted by student.
create index if not exists study_session_items_user_answered_idx on public.study_session_items (user_id, answered_at desc);
create index if not exists material_chunks_user_idx on public.material_chunks (user_id);
create index if not exists reviewer_sections_user_idx on public.reviewer_sections (user_id);
create index if not exists quiz_questions_user_idx on public.quiz_questions (user_id);
create index if not exists tutor_messages_user_idx on public.tutor_messages (user_id);
create index if not exists folders_user_idx on public.folders (user_id);
create index if not exists material_analyses_user_idx on public.material_analyses (user_id);
create index if not exists exam_materials_user_idx on public.exam_materials (user_id);
create index if not exists study_plans_user_idx on public.study_plans (user_id);

-- Foreign keys that are cleared or followed when their parent is deleted or read.
create index if not exists quiz_questions_source_chunk_idx on public.quiz_questions (source_chunk_id) where source_chunk_id is not null;
create index if not exists mistakes_question_idx on public.mistakes (question_id) where question_id is not null;
create index if not exists mistakes_attempt_idx on public.mistakes (attempt_id) where attempt_id is not null;
create index if not exists mistakes_material_idx on public.mistakes (material_id) where material_id is not null;
create index if not exists study_sessions_attempt_idx on public.study_sessions (quiz_attempt_id) where quiz_attempt_id is not null;
create index if not exists study_session_items_mistake_idx on public.study_session_items (source_mistake_id) where source_mistake_id is not null;
create index if not exists flashcard_reviews_session_idx on public.flashcard_reviews (session_id) where session_id is not null;
create index if not exists tutor_conversations_session_idx on public.tutor_conversations (session_id) where session_id is not null;
create index if not exists materials_folder_idx on public.materials (folder_id) where folder_id is not null;
create index if not exists study_tasks_exam_idx on public.study_tasks (exam_id) where exam_id is not null;
create index if not exists study_tasks_session_idx on public.study_tasks (session_id) where session_id is not null;

-- The night run: recent first attempts across students, and mastery due for a refresh.
create index if not exists quiz_answers_answered_idx on public.quiz_answers (answered_at, id);
create index if not exists concept_mastery_stale_idx on public.concept_mastery (computed_at) where attempts > 0;

-- Exact duplicates of a unique index on the same columns.
drop index if exists public.material_chunks_material_idx;
drop index if exists public.concepts_user_idx;
drop index if exists public.reviewer_sections_reviewer_idx;
drop index if exists public.quiz_questions_quiz_idx;
drop index if exists public.study_session_items_session_idx;
drop index if exists public.flashcards_deck_idx;

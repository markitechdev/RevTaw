-- 0011_search.sql
-- Phase 10: global search (§33). Full-text indexes over the text students
-- search across — materials and their chunks, reviewers and their sections,
-- quiz questions, flashcards, concepts and tutor conversations — so that
-- "binary tree" finds every related resource. Ownership is unchanged: RLS
-- still filters every query to the signed-in student's rows.

-- One searchable text column where two columns are searched together, so the
-- PostgREST full-text filter targets a single column and uses its index.
alter table public.reviewer_sections
  add column search_text text generated always as (coalesce(heading, '') || ' ' || content) stored;
alter table public.flashcards
  add column search_text text generated always as (front || ' ' || back) stored;

create index materials_title_fts_idx on public.materials using gin (to_tsvector('english', title));
create index material_chunks_content_fts_idx on public.material_chunks using gin (to_tsvector('english', content));
create index reviewers_title_fts_idx on public.reviewers using gin (to_tsvector('english', title));
create index reviewer_sections_search_fts_idx on public.reviewer_sections using gin (to_tsvector('english', search_text));
create index quiz_questions_prompt_fts_idx on public.quiz_questions using gin (to_tsvector('english', prompt));
create index flashcards_search_fts_idx on public.flashcards using gin (to_tsvector('english', search_text));
create index concepts_name_fts_idx on public.concepts using gin (to_tsvector('english', name));
create index tutor_conversations_title_fts_idx on public.tutor_conversations using gin (to_tsvector('english', title));
create index tutor_messages_content_fts_idx on public.tutor_messages using gin (to_tsvector('english', content));

-- 0037_extraction_notes.sql
-- What a material's reading found, and what a deck was asked for, kept so
-- they outlive a Re-analyze or a Retry.
--
--   * materials.extraction_note: how the file was read (only the first part
--     of a long file, pages without readable text, equations turned into
--     text, pictures skipped, text read from an image by AI). It lived only
--     in status_detail, which Re-analyze rewrites with the analysis result,
--     so the note disappeared while the header kept the full page count.
--   * flashcard_decks.requested_count and focus: what the student asked
--     for, so retrying a failed deck makes the same deck rather than 20
--     cards on the whole material.
--
-- The tables' row-level security already covers the new columns. A material's
-- status detail may now be up to 2,000 characters (it was 500).

alter table public.materials
  add column if not exists extraction_note text
    constraint materials_extraction_note_length check (char_length(extraction_note) <= 2000);

-- The status detail now carries the analysis result and the extraction note together.
alter table public.materials drop constraint if exists materials_status_detail_length;
alter table public.materials
  add constraint materials_status_detail_length check (char_length(status_detail) <= 2000);

comment on column public.materials.extraction_note is
  'How the file was read, for the student: what was left out or changed (shown with the status detail).';

alter table public.flashcard_decks
  add column if not exists requested_count integer
    constraint flashcard_decks_requested_count_range check (requested_count between 1 and 100),
  add column if not exists focus text
    constraint flashcard_decks_focus_length check (char_length(focus) <= 200);

comment on column public.flashcard_decks.requested_count is 'Cards the student asked for; Retry asks for the same.';
comment on column public.flashcard_decks.focus is 'The topic the student asked the deck to focus on, if any; Retry keeps it.';

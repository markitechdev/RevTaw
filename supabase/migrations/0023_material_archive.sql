-- 0023_material_archive.sql
-- Deleting a material moves it to the Archive instead of erasing it.
--
--   * An archived material can be restored for 30 days. After that — or at
--     once with "Delete permanently" in the Archive — its file, extracted
--     text and analysis are deleted for good (the app does this through the
--     Storage API: on the student's own visits and from /api/cron/archive).
--   * The material row stays behind as a record: its title, subject and
--     folder keep every reviewer, quiz, flashcard deck, memory aid and bit of
--     progress made from it filed where it was. material_status gains
--     'deleted' for these rows, so nothing tries to process or study the
--     missing file; purged_at says when the file went.
--   * Materials archived before this change get the full 30 days from now.

alter type public.material_status add value if not exists 'deleted';

alter table public.materials
  add column purged_at timestamptz,
  -- A deleted file can't come back, so its row never leaves the Archive.
  add constraint materials_purged_stays_archived check (purged_at is null or archived_at is not null);

comment on column public.materials.archived_at is
  'When the material was moved to the Archive (by Delete). Archived materials are deleted permanently 30 days later; restoring clears this.';
comment on column public.materials.purged_at is
  'When the file, extracted text and analysis were deleted permanently. The row stays (status deleted) so what was made from the material keeps its title, subject and folder.';

update public.materials
   set archived_at = now()
 where archived_at is not null
   and purged_at is null;

-- What is due for permanent deletion, oldest first.
create index materials_archive_due_idx on public.materials (archived_at)
  where archived_at is not null and purged_at is null;

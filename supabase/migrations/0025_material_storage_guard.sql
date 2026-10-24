-- 0025_material_storage_guard.sql
-- A material's storage_path can only point inside the material's own folder.
--
--   * Students can update their own rows through the Data API, and the
--     Archive's 30-day job removes files with the secret key, which skips
--     Storage's per-student rules. Without this check a student could aim
--     their own row's storage_path at another student's file and have the
--     job delete it (the job also checks the prefix since this release).
--   * RevTaw itself always writes `<user_id>/<material id>/<file name>`, so
--     existing rows already satisfy the rule; it is enforced only when
--     storage_path is set or changed.

create or replace function public.materials_guard_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_path is not null
     and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
     and (
       not starts_with(new.storage_path, new.user_id::text || '/' || new.id::text || '/')
       or new.storage_path ~ '(^|/)\.{1,2}(/|$)'
       or new.storage_path ~ '[\\[:cntrl:]]'
     ) then
    raise exception 'storage_path must stay inside the material''s own folder'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.materials_guard_storage_path() is
  'Keeps materials.storage_path inside <user_id>/<material id>/ so a row can never name another student''s file.';

drop trigger if exists materials_guard_storage_path on public.materials;
create trigger materials_guard_storage_path
  before insert or update of storage_path on public.materials
  for each row execute function public.materials_guard_storage_path();

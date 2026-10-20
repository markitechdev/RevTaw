-- 0012_preferences.sql
-- UI and personalization phase: each student's preferences — appearance
-- (theme color, reduced motion), the home dashboard layout, which RevTaw tools
-- sit in the navigation, how the AI answers (language, style, depth), study
-- defaults, notification channels and the floating assistant.
--
-- Stored as one JSON object per student, keyed by section, so a new
-- preference does not need a migration. The app validates every section with
-- zod when it writes and falls back to defaults for anything missing or
-- malformed when it reads, so an old or hand-edited value never breaks a page.

alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb
    constraint profiles_preferences_object check (jsonb_typeof(preferences) = 'object')
    constraint profiles_preferences_size check (octet_length(preferences::text) <= 16384);

comment on column public.profiles.preferences is
  'Personal preferences by section (appearance, dashboard, tools, ai, study, notifications, assistant). Validated by the app; defaults fill anything missing.';

-- Saves one section at a time and atomically, so two tabs saving different
-- sections never overwrite each other. SECURITY INVOKER: row-level security
-- still applies, so a student can only ever change their own profile row.
create or replace function public.set_preference_section(section_name text, section_value jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if section_name is null or section_name not in ('appearance', 'dashboard', 'tools', 'ai', 'study', 'notifications', 'assistant') then
    raise exception 'unknown preference section: %', section_name using errcode = '22023';
  end if;
  if section_value is null or jsonb_typeof(section_value) <> 'object' then
    raise exception 'a preference section must be a JSON object' using errcode = '22023';
  end if;

  update public.profiles
     set preferences = preferences || jsonb_build_object(section_name, section_value)
   where id = (select auth.uid())
  returning preferences into result;

  if result is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.set_preference_section(text, jsonb) from public, anon;
grant execute on function public.set_preference_section(text, jsonb) to authenticated;

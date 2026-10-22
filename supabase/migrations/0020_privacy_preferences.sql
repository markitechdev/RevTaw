-- 0020_privacy_preferences.sql
-- AI provider round: a "privacy" preferences section (usage analytics,
-- off unless the student turns it on). set_preference_section accepts it.

create or replace function public.set_preference_section(section_name text, section_value jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if section_name is null or section_name not in ('appearance', 'dashboard', 'tools', 'ai', 'study', 'notifications', 'assistant', 'privacy') then
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

comment on column public.profiles.preferences is
  'Personal preferences by section (appearance, dashboard, tools, ai, study, notifications, assistant, privacy). Validated by the app; defaults fill anything missing.';

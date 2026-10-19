-- 0001_profiles.sql
-- Foundation schema: user profiles, onboarding preferences and row-level security.
--
-- Apply with the Supabase SQL editor or `supabase db push`.
-- Every table in RevTaw is owned by exactly one authenticated user and is
-- protected with RLS so that a student can never read or modify another
-- student's data.

-- ---------------------------------------------------------------------------
-- Enumerations used by onboarding (see RevTaw spec §9)
-- ---------------------------------------------------------------------------
create type public.education_level as enum (
  'junior_high',
  'senior_high',
  'college',
  'graduate',
  'professional_review',
  'other'
);

create type public.study_goal as enum (
  'improve_grades',
  'review_lessons',
  'prepare_quizzes',
  'prepare_exams',
  'memorize_information',
  'understand_concepts',
  'practice_problem_solving'
);

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current on every row update
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
    constraint profiles_display_name_length check (char_length(display_name) <= 80),
  education_level public.education_level,
  main_goal public.study_goal,
  preferred_session_minutes smallint
    constraint profiles_session_minutes_range
    check (preferred_session_minutes is null or preferred_session_minutes between 1 and 240),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user profile and study preferences. Mirrors auth.users 1:1.';
comment on column public.profiles.preferred_session_minutes is
  'Preferred study session length in minutes (5, 15, 30, 45, 60 or a custom value).';
comment on column public.profiles.onboarding_completed_at is
  'Null until the student finishes onboarding; the app redirects to /onboarding while null.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row when a user signs up. SECURITY DEFINER lets the auth
-- schema trigger insert into public.profiles without granting anon/authenticated
-- any extra privileges. search_path is pinned to avoid search-path hijacking.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 80), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create policy "profiles: owner can read"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Insert is normally done by the trigger above; this policy lets a signed-in
-- user self-heal a missing row without being able to create rows for others.
create policy "profiles: owner can insert"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: owner can update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy on purpose: profiles are removed through auth.users
-- (ON DELETE CASCADE) when the account is deleted server-side.

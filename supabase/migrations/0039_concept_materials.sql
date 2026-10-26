-- 0039_concept_materials.sql
-- Every material a concept appears in, not only the first one.
--
-- A concept is one row per student and name, so "Photosynthesis" met in
-- Chapter 1 and again in Chapter 3 shares one mastery. concepts.material_id
-- keeps the material it was first made from, and everything that worked per
-- material (a material's mastery, Tamari's plan, an exam's scope, exam
-- boosters, readiness, goals) filtered on that column: a key concept of an
-- exam on Chapter 3, first met in Chapter 1, was treated as out of scope.
--
--   * concept_materials: one row per concept and material it was used with,
--     written whenever RevTaw names concepts for a material (questions,
--     cards, session items). Owner-only, like the rows it links.
--   * A trigger links a new concept to the material it is made from, however
--     the concept is inserted, so a material's own concepts are always found.
--   * Backfilled from what exists: each concept's first material, and the
--     materials of the quiz questions, session items, flashcards and
--     mistakes that point at it.

create table if not exists public.concept_materials (
  concept_id uuid not null,
  material_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (concept_id, material_id),
  constraint concept_materials_concept_fk foreign key (concept_id, user_id)
    references public.concepts (id, user_id) on delete cascade,
  constraint concept_materials_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create index if not exists concept_materials_material_idx on public.concept_materials (material_id);
create index if not exists concept_materials_user_idx on public.concept_materials (user_id);

comment on table public.concept_materials is
  'Each material a concept was used with (concepts.material_id is only the first). Owner-only.';

alter table public.concept_materials enable row level security;

revoke all on public.concept_materials from anon;
grant select, insert, delete on public.concept_materials to authenticated;

drop policy if exists "concept_materials: owner full access" on public.concept_materials;
create policy "concept_materials: owner full access" on public.concept_materials
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- A concept made from a material is linked to it as it is created. Runs as the inserting role, so the
-- link is checked like any other: concepts_material_fk already ties the material to the concept's owner.
create or replace function public.link_concept_to_first_material()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.material_id is not null then
    insert into public.concept_materials (concept_id, material_id, user_id)
    values (new.id, new.material_id, new.user_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists concepts_link_first_material on public.concepts;
create trigger concepts_link_first_material
  after insert on public.concepts
  for each row execute function public.link_concept_to_first_material();

-- Backfill: the material each concept was made from, then every material its answers, cards and mistakes come from.
insert into public.concept_materials (concept_id, material_id, user_id)
select c.id, c.material_id, c.user_id
  from public.concepts c
 where c.material_id is not null
on conflict do nothing;

insert into public.concept_materials (concept_id, material_id, user_id)
select distinct q.concept_id, z.material_id, q.user_id
  from public.quiz_questions q
  join public.quizzes z on z.id = q.quiz_id and z.user_id = q.user_id
 where q.concept_id is not null and z.material_id is not null
on conflict do nothing;

insert into public.concept_materials (concept_id, material_id, user_id)
select distinct i.concept_id, coalesce(i.material_id, s.material_id), i.user_id
  from public.study_session_items i
  join public.study_sessions s on s.id = i.session_id and s.user_id = i.user_id
 where i.concept_id is not null and coalesce(i.material_id, s.material_id) is not null
on conflict do nothing;

insert into public.concept_materials (concept_id, material_id, user_id)
select distinct f.concept_id, d.material_id, f.user_id
  from public.flashcards f
  join public.flashcard_decks d on d.id = f.deck_id and d.user_id = f.user_id
 where f.concept_id is not null and d.material_id is not null
on conflict do nothing;

insert into public.concept_materials (concept_id, material_id, user_id)
select distinct m.concept_id, m.material_id, m.user_id
  from public.mistakes m
 where m.concept_id is not null and m.material_id is not null
on conflict do nothing;

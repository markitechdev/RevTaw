-- 0009_methods_part2.sql
-- Phase 8 (part 2): the remaining study methods.
--   * more session item kinds: dual-coding rebuilds (visual), concept-map
--     relationship checks (link), mnemonic practice (mnemonic), memory-palace
--     stops (loci) and story-method retells (story);
--   * study_maps: editable mind maps, concept maps and dual-coding visual sets;
--   * mnemonics: mnemonics the student generated or wrote and saved;
--   * memory_palaces: the student's own routes of locations;
--   * tutor_messages.visual: a diagram drawn by "Visualize" in highlight-and-ask.

alter table public.study_session_items drop constraint study_session_items_kind_check;
alter table public.study_session_items add constraint study_session_items_kind_check
  check (kind in ('recall', 'feynman', 'mistake', 'blurt', 'chunk', 'question', 'problem', 'scenario', 'case', 'stage', 'visual', 'link', 'mnemonic', 'loci', 'story'));

-- study_maps: mind maps (hierarchical nodes + cross-links), concept maps
-- (concepts + typed relationships) and dual-coding visual sets (topics with a
-- table / flowchart / timeline / hierarchy / relationship visual each).
create table public.study_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid,
  kind text not null constraint study_maps_kind_check check (kind in ('mind', 'concept', 'visual')),
  title text not null constraint study_maps_title_length check (char_length(title) between 1 and 160),
  data jsonb not null default '{}'::jsonb constraint study_maps_data_object check (jsonb_typeof(data) = 'object'),
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_maps_material_fk foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);

create index study_maps_user_idx on public.study_maps (user_id, kind, updated_at desc);
create index study_maps_material_idx on public.study_maps (material_id, kind) where material_id is not null;

create trigger study_maps_set_updated_at
  before update on public.study_maps
  for each row execute function public.set_updated_at();

comment on table public.study_maps is 'Mind maps, concept maps and dual-coding visual sets (§16). data holds the nodes/links, nodes/edges or topics as validated JSON.';

alter table public.study_maps enable row level security;
revoke all on public.study_maps from anon;
grant select, insert, update, delete on public.study_maps to authenticated;
create policy "study_maps: owner full access" on public.study_maps
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- mnemonics: acronyms, acrostics, rhymes, memory phrases, associations,
-- educational stories, or the student's own (custom).
create table public.mnemonics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid,
  concept_id uuid,
  kind text not null constraint mnemonics_kind_check check (kind in ('acronym', 'acrostic', 'rhyme', 'phrase', 'association', 'story', 'custom')),
  target text not null constraint mnemonics_target_length check (char_length(target) between 1 and 200),
  items text[] not null default '{}' constraint mnemonics_items_count check (cardinality(items) <= 20),
  content text not null constraint mnemonics_content_length check (char_length(content) between 1 and 2000),
  explanation text constraint mnemonics_explanation_length check (explanation is null or char_length(explanation) <= 2000),
  source text not null default 'user' constraint mnemonics_source_check check (source in ('ai', 'user')),
  favorite boolean not null default false,
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mnemonics_material_fk foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id),
  constraint mnemonics_concept_fk foreign key (concept_id, user_id) references public.concepts (id, user_id) on delete set null (concept_id)
);

create index mnemonics_user_idx on public.mnemonics (user_id, updated_at desc);
create index mnemonics_material_idx on public.mnemonics (material_id) where material_id is not null;

create trigger mnemonics_set_updated_at
  before update on public.mnemonics
  for each row execute function public.set_updated_at();

comment on table public.mnemonics is 'Saved mnemonics (§16): what they help remember (target, ordered items) and the mnemonic itself; source ai or user.';

alter table public.mnemonics enable row level security;
revoke all on public.mnemonics from anon;
grant select, insert, update, delete on public.mnemonics to authenticated;
create policy "mnemonics: owner full access" on public.mnemonics
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- memory_palaces: an ordered route of familiar locations (method of loci).
create table public.memory_palaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null constraint memory_palaces_title_length check (char_length(title) between 1 and 120),
  locations jsonb not null default '[]'::jsonb constraint memory_palaces_locations_array check (jsonb_typeof(locations) = 'array' and jsonb_array_length(locations) <= 30),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_palaces_user_idx on public.memory_palaces (user_id, updated_at desc);

create trigger memory_palaces_set_updated_at
  before update on public.memory_palaces
  for each row execute function public.set_updated_at();

comment on table public.memory_palaces is 'Memory palaces (§16 method of loci): ordered locations [{name, detail}] the student walks during recall.';

alter table public.memory_palaces enable row level security;
revoke all on public.memory_palaces from anon;
grant select, insert, update, delete on public.memory_palaces to authenticated;
create policy "memory_palaces: owner full access" on public.memory_palaces
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Highlight-and-ask "Visualize": the tutor's reply can carry one visual.
alter table public.tutor_messages
  add column visual jsonb constraint tutor_messages_visual_object check (visual is null or jsonb_typeof(visual) = 'object');

comment on column public.tutor_messages.visual is 'Optional dual-coding visual (table, flowchart, timeline, hierarchy or relationships) drawn for a Visualize request.';

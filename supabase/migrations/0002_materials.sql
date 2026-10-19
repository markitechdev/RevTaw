-- 0002_materials.sql
-- Phase 2: study materials — subjects, folders, uploaded materials, extracted
-- chunks, AI analysis and the private storage bucket.
--
-- Ownership model: every row carries user_id (defaulting to auth.uid()) and is
-- protected by owner-only RLS. Composite foreign keys (id, user_id) guarantee
-- that a material can only point at a subject or folder owned by the same
-- user, which plain foreign keys would not enforce under RLS.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.material_source as enum ('pdf', 'docx', 'doc', 'image', 'text');

create type public.material_status as enum (
  'uploading',
  'extracting',
  'analyzing',
  'ready',
  'failed'
);

create type public.difficulty_level as enum ('beginner', 'intermediate', 'advanced');

-- ---------------------------------------------------------------------------
-- subjects: top-level organisation (e.g. "Data Structures", "Anatomy")
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint subjects_name_length check (char_length(name) between 1 and 80),
  color text constraint subjects_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_id_user_unique unique (id, user_id)
);

create unique index subjects_user_name_unique on public.subjects (user_id, lower(name));
create index subjects_user_idx on public.subjects (user_id, archived_at, name);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- folders: a grouping inside a subject (chapter, topic, semester…)
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  name text not null constraint folders_name_length check (char_length(name) between 1 and 80),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint folders_id_user_unique unique (id, user_id),
  constraint folders_id_subject_unique unique (id, subject_id),
  constraint folders_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete cascade
);

create unique index folders_subject_name_unique on public.folders (subject_id, lower(name));
create index folders_subject_idx on public.folders (subject_id, position, name);

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- materials: one uploaded file or pasted note
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  folder_id uuid,
  title text not null constraint materials_title_length check (char_length(title) between 1 and 160),
  source public.material_source not null,
  original_filename text constraint materials_filename_length check (char_length(original_filename) <= 255),
  mime_type text constraint materials_mime_length check (char_length(mime_type) <= 120),
  file_size bigint constraint materials_file_size_range check (file_size is null or file_size between 0 and 104857600),
  storage_path text constraint materials_storage_path_length check (char_length(storage_path) <= 512),
  content_hash text constraint materials_content_hash_format check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  status public.material_status not null default 'uploading',
  status_detail text constraint materials_status_detail_length check (char_length(status_detail) <= 500),
  processing_attempts integer not null default 0,
  last_processed_at timestamptz,
  page_count integer,
  word_count integer,
  last_opened_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_id_user_unique unique (id, user_id),
  constraint materials_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint materials_folder_fk foreign key (folder_id, user_id)
    references public.folders (id, user_id) on delete set null (folder_id),
  constraint materials_folder_in_subject_fk foreign key (folder_id, subject_id)
    references public.folders (id, subject_id) on delete set null (folder_id)
);

create index materials_user_recent_idx on public.materials (user_id, archived_at, updated_at desc);
create index materials_user_subject_idx on public.materials (user_id, subject_id, folder_id);
create index materials_user_hash_idx on public.materials (user_id, content_hash) where content_hash is not null;
create index materials_user_opened_idx on public.materials (user_id, last_opened_at desc nulls last);

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

comment on column public.materials.storage_path is
  'Object path inside the private "materials" bucket: <user_id>/<material_id>/<filename>.';
comment on column public.materials.content_hash is
  'SHA-256 of the stored bytes; lets identical uploads reuse extracted text and analysis.';
comment on column public.materials.status_detail is
  'Student-facing explanation of the current status (e.g. why processing failed).';

-- ---------------------------------------------------------------------------
-- material_chunks: extracted text split into ordered sections with page info
-- ---------------------------------------------------------------------------
create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null constraint material_chunks_position_nonnegative check (position >= 0),
  heading text constraint material_chunks_heading_length check (char_length(heading) <= 200),
  page_start integer,
  page_end integer,
  content text not null,
  char_count integer not null,
  constraint material_chunks_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade,
  constraint material_chunks_material_position_unique unique (material_id, position)
);

create index material_chunks_material_idx on public.material_chunks (material_id, position);

-- ---------------------------------------------------------------------------
-- material_analyses: structured AI analysis, one per material
-- ---------------------------------------------------------------------------
create table public.material_analyses (
  material_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  summary text not null,
  difficulty public.difficulty_level not null,
  estimated_study_minutes integer not null
    constraint material_analyses_minutes_range check (estimated_study_minutes between 1 and 6000),
  coverage_ratio numeric(4, 3) not null default 1
    constraint material_analyses_coverage_range check (coverage_ratio between 0 and 1),
  data jsonb not null default '{}'::jsonb,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_analyses_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete cascade
);

create trigger material_analyses_set_updated_at
  before update on public.material_analyses
  for each row execute function public.set_updated_at();

comment on column public.material_analyses.data is
  'Validated analysis payload: main_topics, key_concepts, definitions, formulas, important_facts, exam_topics, recommended_methods.';
comment on column public.material_analyses.coverage_ratio is
  'Share of the extracted text the model actually saw (1 = everything).';

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.folders enable row level security;
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.material_analyses enable row level security;

revoke all on public.subjects, public.folders, public.materials,
  public.material_chunks, public.material_analyses from anon;
grant select, insert, update, delete on public.subjects, public.folders, public.materials,
  public.material_chunks, public.material_analyses to authenticated;

create policy "subjects: owner full access" on public.subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "folders: owner full access" on public.folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "materials: owner full access" on public.materials
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "material_chunks: owner full access" on public.material_chunks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "material_analyses: owner full access" on public.material_analyses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploads. Objects live under <user_id>/… so the
-- first path segment doubles as the ownership check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do nothing;

create policy "materials bucket: owner can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "materials bucket: owner can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "materials bucket: owner can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "materials bucket: owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

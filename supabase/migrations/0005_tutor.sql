-- 0005_tutor.sql
-- Phase 5: the AI tutor — conversations grounded in a material, their
-- messages with the sources each answer relied on, and the link from tutor
-- based study sessions (Socratic questioning, elaborative interrogation,
-- self-explanation) to their conversation.
--
-- Same ownership model as before: user_id defaults to auth.uid(), owner-only
-- RLS, composite (id, user_id) foreign keys.

create type public.tutor_mode as enum ('tutor', 'guided', 'socratic', 'elaborative', 'self_explanation');

create type public.tutor_role as enum ('user', 'assistant');

create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid,
  session_id uuid,
  title text not null constraint tutor_conversations_title_length check (char_length(title) between 1 and 160),
  mode public.tutor_mode not null default 'tutor',
  message_count integer not null default 0,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutor_conversations_id_user_unique unique (id, user_id),
  constraint tutor_conversations_material_fk foreign key (material_id, user_id)
    references public.materials (id, user_id) on delete set null (material_id),
  constraint tutor_conversations_session_fk foreign key (session_id, user_id)
    references public.study_sessions (id, user_id) on delete set null (session_id)
);

create index tutor_conversations_user_recent_idx on public.tutor_conversations (user_id, archived_at, last_message_at desc);
create index tutor_conversations_material_idx on public.tutor_conversations (material_id);

create trigger tutor_conversations_set_updated_at
  before update on public.tutor_conversations
  for each row execute function public.set_updated_at();

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role public.tutor_role not null,
  content text not null constraint tutor_messages_content_length check (char_length(content) between 1 and 16000),
  action text constraint tutor_messages_action_length check (char_length(action) <= 40),
  selection text constraint tutor_messages_selection_length check (char_length(selection) <= 4000),
  grounding text constraint tutor_messages_grounding_check check (grounding is null or grounding in ('material', 'partial', 'general', 'not_found')),
  sources jsonb not null default '[]'::jsonb,
  additional_explanation text constraint tutor_messages_additional_length check (char_length(additional_explanation) <= 4000),
  follow_ups jsonb not null default '[]'::jsonb,
  flashcard jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  constraint tutor_messages_conversation_fk foreign key (conversation_id, user_id)
    references public.tutor_conversations (id, user_id) on delete cascade
);

create index tutor_messages_conversation_idx on public.tutor_messages (conversation_id, created_at);

comment on column public.tutor_messages.sources is
  'Material passages the answer relied on: [{"position": 3, "heading": "...", "pages": "4-5", "quote": "..."}].';
comment on column public.tutor_messages.grounding is
  'material = fully supported by the material, partial = material plus general knowledge, general = general knowledge only, not_found = the material does not cover it.';

alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;

revoke all on public.tutor_conversations, public.tutor_messages from anon;
grant select, insert, update, delete on public.tutor_conversations, public.tutor_messages to authenticated;

create policy "tutor_conversations: owner full access" on public.tutor_conversations
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tutor_messages: owner full access" on public.tutor_messages
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

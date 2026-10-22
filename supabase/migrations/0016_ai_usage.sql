-- 0016_ai_usage.sql
-- AI provider round: each student's daily AI allowance.
--
--   * ai_usage: one row per student, Philippine calendar day and kind of AI
--     work (chat, generate, study, upload, voice), counting requests and
--     tokens. Students can read their own rows; nobody writes them directly.
--   * consume_ai_request(kind, daily_limit): atomically takes one request
--     from today's allowance of the signed-in student and says whether it was
--     allowed. The limit comes from the server's configuration
--     (AI_DAILY_LIMITS). The function only touches the caller's own row and
--     only counts up, so calling it from a browser can only use up that
--     student's own allowance; it cannot raise anyone's limit.
--   * add_ai_tokens(kind, input, output): adds a finished call's token counts
--     to the caller's row, so real request sizes can be measured before the
--     limits are tuned.
--   * refund_ai_request(user, kind): gives a request back when every AI
--     provider failed. Only the server's secret key may call it.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null
    constraint ai_usage_kind_valid check (kind in ('chat', 'generate', 'study', 'upload', 'voice')),
  requests integer not null default 0
    constraint ai_usage_requests_range check (requests >= 0),
  input_tokens bigint not null default 0
    constraint ai_usage_input_tokens_range check (input_tokens >= 0),
  output_tokens bigint not null default 0
    constraint ai_usage_output_tokens_range check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_usage_pkey primary key (user_id, day, kind)
);

create index ai_usage_day_idx on public.ai_usage (day);

comment on table public.ai_usage is
  'Daily AI requests and tokens per student (Asia/Manila days). Written only through consume_ai_request, add_ai_tokens and refund_ai_request.';

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy "ai_usage: owner can read" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- SECURITY DEFINER so it can write a table students may only read; the
-- caller is always auth.uid(), never a parameter.
create or replace function public.consume_ai_request(p_kind text, p_daily_limit integer)
returns table (allowed boolean, used integer, daily_limit integer, resets_at timestamptz, student_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Manila')::date;
  next_reset timestamptz := ((now() at time zone 'Asia/Manila')::date + 1)::timestamp at time zone 'Asia/Manila';
  current_count integer;
begin
  if caller is null then
    raise exception 'sign in to use AI features' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('chat', 'generate', 'study', 'upload', 'voice') then
    raise exception 'unknown AI usage kind: %', p_kind using errcode = '22023';
  end if;
  if p_daily_limit is null or p_daily_limit < 0 or p_daily_limit > 100000 then
    raise exception 'daily limit out of range' using errcode = '22023';
  end if;

  insert into public.ai_usage (user_id, day, kind)
  values (caller, today, p_kind)
  on conflict on constraint ai_usage_pkey do nothing;

  -- One statement checks and counts, so two requests racing for the last
  -- slot cannot both get it.
  update public.ai_usage u
     set requests = u.requests + 1,
         updated_at = now()
   where u.user_id = caller
     and u.day = today
     and u.kind = p_kind
     and u.requests < p_daily_limit
  returning u.requests into current_count;

  if current_count is not null then
    return query select true, current_count, p_daily_limit, next_reset, caller;
    return;
  end if;

  select u.requests into current_count
    from public.ai_usage u
   where u.user_id = caller and u.day = today and u.kind = p_kind;
  return query select false, coalesce(current_count, 0), p_daily_limit, next_reset, caller;
end;
$$;

revoke all on function public.consume_ai_request(text, integer) from public, anon;
grant execute on function public.consume_ai_request(text, integer) to authenticated;

create or replace function public.add_ai_tokens(p_kind text, p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if caller is null then
    raise exception 'sign in to use AI features' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('chat', 'generate', 'study', 'upload', 'voice') then
    raise exception 'unknown AI usage kind: %', p_kind using errcode = '22023';
  end if;
  if p_input_tokens is null or p_output_tokens is null
     or p_input_tokens < 0 or p_output_tokens < 0
     or p_input_tokens > 2000000 or p_output_tokens > 2000000 then
    raise exception 'token counts out of range' using errcode = '22023';
  end if;

  insert into public.ai_usage as u (user_id, day, kind, input_tokens, output_tokens)
  values (caller, today, p_kind, p_input_tokens, p_output_tokens)
  on conflict on constraint ai_usage_pkey do update
    set input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens,
        updated_at = now();
end;
$$;

revoke all on function public.add_ai_tokens(text, integer, integer) from public, anon;
grant execute on function public.add_ai_tokens(text, integer, integer) to authenticated;

create or replace function public.refund_ai_request(p_user_id uuid, p_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_usage
     set requests = greatest(requests - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and day = (now() at time zone 'Asia/Manila')::date
     and kind = p_kind;
$$;

revoke all on function public.refund_ai_request(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_request(uuid, text) to service_role;

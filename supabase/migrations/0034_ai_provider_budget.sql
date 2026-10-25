-- 0034_ai_provider_budget.sql
-- Token budgets for an AI provider whose free allowance every student shares
-- (Ollama Cloud's free plan: a monthly allowance, counted in tokens, that
-- resets on the day the account signed up).
--
--   * ai_provider_usage: the tokens one provider used each day (UTC), all
--     students together. Rows stay when an account is deleted, because the
--     provider counted those tokens too; they name no student.
--   * ai_provider_student_usage: the same for each student, so one student
--     cannot use everyone's share. Deleted with the account.
--   * reserve_ai_provider_tokens(): before a call, checks the provider's total
--     budget and the student's budget over the last p_days days plus today
--     and, when the call fits both, sets its estimated tokens aside. One call
--     at a time per provider does this, so calls racing for the last tokens
--     cannot all get them.
--   * settle_ai_provider_tokens(): after the call, swaps the estimate for the
--     tokens the provider reported (or keeps the estimate when it cannot be
--     known).
--   * ai_provider_usage_summary(): totals for the service check; no student
--     is named.
--   * Only the server's secret key may call these; students cannot read or
--     change either table.

create table public.ai_provider_usage (
  provider text not null
    constraint ai_provider_usage_provider_name check (provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  day date not null,
  requests integer not null default 0
    constraint ai_provider_usage_requests_range check (requests >= 0),
  input_tokens bigint not null default 0
    constraint ai_provider_usage_input_range check (input_tokens >= 0),
  output_tokens bigint not null default 0
    constraint ai_provider_usage_output_range check (output_tokens >= 0),
  reserved_tokens bigint not null default 0
    constraint ai_provider_usage_reserved_range check (reserved_tokens >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_provider_usage_pkey primary key (provider, day)
);

comment on table public.ai_provider_usage is
  'Tokens each budgeted AI provider used per UTC day, all students together (reserved_tokens: calls still running). Written only through reserve_ai_provider_tokens and settle_ai_provider_tokens.';

create table public.ai_provider_student_usage (
  provider text not null
    constraint ai_provider_student_usage_provider_name check (provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null default 0
    constraint ai_provider_student_usage_requests_range check (requests >= 0),
  input_tokens bigint not null default 0
    constraint ai_provider_student_usage_input_range check (input_tokens >= 0),
  output_tokens bigint not null default 0
    constraint ai_provider_student_usage_output_range check (output_tokens >= 0),
  reserved_tokens bigint not null default 0
    constraint ai_provider_student_usage_reserved_range check (reserved_tokens >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_provider_student_usage_pkey primary key (provider, user_id, day)
);

create index ai_provider_student_usage_day_idx on public.ai_provider_student_usage (provider, day);

comment on table public.ai_provider_student_usage is
  'Tokens each student used per UTC day on each budgeted AI provider. Deleted with the account. Written only through reserve_ai_provider_tokens and settle_ai_provider_tokens.';

alter table public.ai_provider_usage enable row level security;
alter table public.ai_provider_student_usage enable row level security;
revoke all on public.ai_provider_usage from anon, authenticated;
revoke all on public.ai_provider_student_usage from anon, authenticated;
-- The functions run with the caller's rights; Supabase gives service_role
-- these already, stated here so the migration does not depend on it.
grant select, insert, update on public.ai_provider_usage to service_role;
grant select, insert, update on public.ai_provider_student_usage to service_role;

create or replace function public.reserve_ai_provider_tokens(
  p_provider text,
  p_user_id uuid,
  p_tokens integer,
  p_total_limit bigint,
  p_student_limit bigint,
  p_days integer
)
returns table (allowed boolean, reason text, usage_day date, total_used bigint, student_used bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  since date;
  used_total bigint;
  used_student bigint := 0;
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9_]{0,39}$' then
    raise exception 'unknown AI provider: %', p_provider using errcode = '22023';
  end if;
  if p_tokens is null or p_tokens < 1 or p_tokens > 2000000 then
    raise exception 'token estimate out of range' using errcode = '22023';
  end if;
  if p_total_limit is null or p_total_limit < 0 or p_total_limit > 100000000000
     or p_student_limit is null or p_student_limit < 0 or p_student_limit > 100000000000 then
    raise exception 'token budget out of range' using errcode = '22023';
  end if;
  if p_days is null or p_days < 0 or p_days > 366 then
    raise exception 'budget window out of range' using errcode = '22023';
  end if;
  since := today - p_days;

  -- One reservation at a time per provider (held until this call's
  -- transaction ends), so two calls cannot both take the last tokens.
  perform pg_advisory_xact_lock(hashtextextended('revtaw.ai_provider_budget:' || p_provider, 0));

  select coalesce(sum(u.input_tokens + u.output_tokens + u.reserved_tokens), 0)
    into used_total
    from public.ai_provider_usage u
   where u.provider = p_provider and u.day >= since;

  if p_user_id is not null then
    select coalesce(sum(s.input_tokens + s.output_tokens + s.reserved_tokens), 0)
      into used_student
      from public.ai_provider_student_usage s
     where s.provider = p_provider and s.user_id = p_user_id and s.day >= since;
  end if;

  if used_total + p_tokens > p_total_limit then
    return query select false, 'total'::text, today, used_total, used_student;
    return;
  end if;
  if p_user_id is not null and used_student + p_tokens > p_student_limit then
    return query select false, 'student'::text, today, used_total, used_student;
    return;
  end if;

  insert into public.ai_provider_usage as u (provider, day, requests, reserved_tokens)
  values (p_provider, today, 1, p_tokens)
  on conflict on constraint ai_provider_usage_pkey do update
    set requests = u.requests + 1,
        reserved_tokens = u.reserved_tokens + excluded.reserved_tokens,
        updated_at = now();

  if p_user_id is not null then
    insert into public.ai_provider_student_usage as s (provider, user_id, day, requests, reserved_tokens)
    values (p_provider, p_user_id, today, 1, p_tokens)
    on conflict on constraint ai_provider_student_usage_pkey do update
      set requests = s.requests + 1,
          reserved_tokens = s.reserved_tokens + excluded.reserved_tokens,
          updated_at = now();
    used_student := used_student + p_tokens;
  end if;

  return query select true, null::text, today, used_total + p_tokens, used_student;
end;
$$;

create or replace function public.settle_ai_provider_tokens(
  p_provider text,
  p_user_id uuid,
  p_day date,
  p_reserved integer,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9_]{0,39}$' then
    raise exception 'unknown AI provider: %', p_provider using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'the reservation''s day is required' using errcode = '22023';
  end if;
  if p_reserved is null or p_input_tokens is null or p_output_tokens is null
     or p_reserved < 0 or p_input_tokens < 0 or p_output_tokens < 0
     or p_reserved > 2000000 or p_input_tokens > 2000000 or p_output_tokens > 2000000 then
    raise exception 'token counts out of range' using errcode = '22023';
  end if;

  update public.ai_provider_usage u
     set reserved_tokens = greatest(u.reserved_tokens - p_reserved, 0),
         input_tokens = u.input_tokens + p_input_tokens,
         output_tokens = u.output_tokens + p_output_tokens,
         updated_at = now()
   where u.provider = p_provider and u.day = p_day;

  -- No row when the student deleted their account while the call ran.
  if p_user_id is not null then
    update public.ai_provider_student_usage s
       set reserved_tokens = greatest(s.reserved_tokens - p_reserved, 0),
           input_tokens = s.input_tokens + p_input_tokens,
           output_tokens = s.output_tokens + p_output_tokens,
           updated_at = now()
     where s.provider = p_provider and s.user_id = p_user_id and s.day = p_day;
  end if;
end;
$$;

create or replace function public.ai_provider_usage_summary(p_provider text, p_days integer)
returns table (
  requests bigint,
  input_tokens bigint,
  output_tokens bigint,
  reserved_tokens bigint,
  students integer,
  most_by_one_student bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with window_start as (
    select (now() at time zone 'UTC')::date - greatest(coalesce(p_days, 0), 0) as since
  ),
  totals as (
    select coalesce(sum(u.requests), 0)::bigint as requests,
           coalesce(sum(u.input_tokens), 0)::bigint as input_tokens,
           coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
           coalesce(sum(u.reserved_tokens), 0)::bigint as reserved_tokens
      from public.ai_provider_usage u, window_start w
     where u.provider = p_provider and u.day >= w.since
  ),
  per_student as (
    select s.user_id, sum(s.input_tokens + s.output_tokens + s.reserved_tokens) as tokens
      from public.ai_provider_student_usage s, window_start w
     where s.provider = p_provider and s.day >= w.since
     group by s.user_id
  )
  select t.requests, t.input_tokens, t.output_tokens, t.reserved_tokens,
         (select count(*)::integer from per_student),
         (select coalesce(max(p.tokens), 0)::bigint from per_student p)
    from totals t;
$$;

revoke all on function public.reserve_ai_provider_tokens(text, uuid, integer, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.settle_ai_provider_tokens(text, uuid, date, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_provider_usage_summary(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_provider_tokens(text, uuid, integer, bigint, bigint, integer) to service_role;
grant execute on function public.settle_ai_provider_tokens(text, uuid, date, integer, integer, integer) to service_role;
grant execute on function public.ai_provider_usage_summary(text, integer) to service_role;

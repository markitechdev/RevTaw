-- 0021_ai_usage_server_tokens.sql
-- Security review follow-up: token, audio-second and character counts are
-- added only by the server (its secret key), so a student cannot skew the
-- measurements the daily limits are tuned from. Students could previously
-- call add_ai_tokens for their own row; consume_ai_request is unchanged.

drop function if exists public.add_ai_tokens(text, integer, integer);

create or replace function public.add_ai_tokens(p_user_id uuid, p_kind text, p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'a student id is required' using errcode = '22023';
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
  values (p_user_id, (now() at time zone 'Asia/Manila')::date, p_kind, p_input_tokens, p_output_tokens)
  on conflict on constraint ai_usage_pkey do update
    set input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens,
        updated_at = now();
end;
$$;

revoke all on function public.add_ai_tokens(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.add_ai_tokens(uuid, text, integer, integer) to service_role;

-- The function runs with the caller's rights; Supabase gives service_role
-- these already, stated here so the migration does not depend on it.
grant select, insert, update on public.ai_usage to service_role;

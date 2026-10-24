-- 0026_rate_limits.sql
-- Rate limits shared by every server instance.
--
--   * RevTaw's limits (sign-in attempts per address and per account, sign-ups,
--     reset emails, uploads, exports, generation) used to live in each
--     server's memory: on Vercel they multiplied with the number of running
--     instances and reset on every cold start and deploy.
--   * rate_limit_hit(key, limit, window) counts one hit in a fixed window and
--     says whether it is allowed. Keys are hashed by the app (no raw email or
--     IP addresses are stored). Only the server's secret key may call it;
--     students cannot read or change the table.
--   * Expired windows are cleaned up now and then by the function itself.

create table public.rate_limits (
  key text primary key
    constraint rate_limits_key_length check (char_length(key) between 1 and 128),
  hits integer not null default 0
    constraint rate_limits_hits_range check (hits >= 0),
  expires_at timestamptz not null
);

create index rate_limits_expires_idx on public.rate_limits (expires_at);

comment on table public.rate_limits is
  'Fixed-window rate-limit counters shared by all server instances (hashed keys). Written only through rate_limit_hit().';

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hits integer;
  v_expires timestamptz;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate_limit_hit: invalid arguments' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.rate_limits as r (key, hits, expires_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set hits = case when r.expires_at <= v_now then 1 else r.hits + 1 end,
        expires_at = case when r.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds) else r.expires_at end
  returning r.hits, r.expires_at into v_hits, v_expires;

  -- About one call in two hundred sweeps windows that ended over an hour ago.
  if random() < 0.005 then
    delete from public.rate_limits where expires_at < v_now - interval '1 hour';
  end if;

  allowed := v_hits <= p_limit;
  hits := v_hits;
  retry_after_seconds := greatest(1, ceil(extract(epoch from (v_expires - v_now))))::integer;
  return next;
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is
  'Counts one hit for a hashed key in a fixed window of p_window_seconds; allowed is false past p_limit. Server (secret key) only.';

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

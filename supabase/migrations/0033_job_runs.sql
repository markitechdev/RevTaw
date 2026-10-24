-- 0033_job_runs.sql
-- When each scheduled job last ran, for the health check.
--
--   * A scheduler that stops calling (a changed CRON_SECRET, pg_cron off, an
--     expired address) failed silently: reminders and digests just stopped.
--   * job_runs keeps one row per job (reminders, digest, embeddings, calendar,
--     engine, archive): when its last run finished, when one last succeeded,
--     and the last error. The jobs write it with the server's secret key;
--     /api/health reads it and says which jobs are late.
--   * Students cannot read or change it.

create table public.job_runs (
  job text primary key
    constraint job_runs_job_name check (job ~ '^[a-z][a-z-]{0,39}$'),
  last_finished_at timestamptz,
  last_ok_at timestamptz,
  last_error text
    constraint job_runs_error_length check (last_error is null or char_length(last_error) <= 500)
);

comment on table public.job_runs is
  'The last run of each scheduled job (written by the jobs with the secret key, read by /api/health). Not visible to students.';

alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;

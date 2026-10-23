-- supabase/schedules.sql — run once in the Supabase SQL editor (not a migration).
--
-- Calls RevTaw's scheduler routes from the database with pg_cron and pg_net,
-- so reminders, the daily digest, search embeddings, Google Calendar, the
-- learning engine's night run and the Archive's 30 days work on any host
-- (Vercel's Hobby cron runs at most once a day). The site URL and
-- CRON_SECRET are kept in Supabase Vault, never in this file.
--
-- 1. Database → Extensions: turn on pg_cron and pg_net (or run the two lines
--    below).
-- 2. Replace the two placeholders in step 2, run the whole file, then delete
--    the values from the editor tab. Use the same CRON_SECRET as the app's
--    environment variables.
-- 3. To change a value later: select vault.update_secret(id, 'new value')
--    with the id from vault.secrets; to stop a job: select cron.unschedule('name').

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Step 2: your deployment's address (no trailing slash) and CRON_SECRET.
select vault.create_secret('https://YOUR-REVTAW-DOMAIN', 'revtaw_site_url', 'RevTaw site URL for scheduled calls');
select vault.create_secret('PASTE-YOUR-CRON-SECRET-HERE', 'revtaw_cron_secret', 'RevTaw CRON_SECRET for scheduled calls');

-- Calls one RevTaw route with the secret; pg_net sends it in the background.
create or replace function public.revtaw_call(path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'revtaw_site_url') || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'revtaw_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;

revoke all on function public.revtaw_call(text) from public, anon, authenticated;

-- Planner reminders, in-app and by email: every minute.
select cron.schedule('revtaw-reminders', '* * * * *', $$ select public.revtaw_call('/api/cron/reminders') $$);

-- The daily study digest: every 15 minutes; each student gets it once, 6–11 a.m. their time.
select cron.schedule('revtaw-digest', '*/15 * * * *', $$ select public.revtaw_call('/api/cron/digest') $$);

-- Search embeddings for chunks that are still waiting: every 10 minutes.
select cron.schedule('revtaw-embeddings', '*/10 * * * *', $$ select public.revtaw_call('/api/cron/embeddings') $$);

-- Google Calendar for students who connected it: every hour (changes also sync right away).
select cron.schedule('revtaw-calendar', '17 * * * *', $$ select public.revtaw_call('/api/cron/calendar') $$);

-- The learning engine's night run: question-difficulty buckets, exam boosters and stale
-- mastery. 18:47 and 20:47 UTC (2:47 and 4:47 a.m. in Manila); the second run picks up
-- any students the first one had no time for.
select cron.schedule('revtaw-engine', '47 18,20 * * *', $$ select public.revtaw_call('/api/cron/engine') $$);

-- The Archive: materials deleted 30 days ago lose their file, text and analysis for good
-- (what was made from them stays). 19:13 UTC (3:13 a.m. in Manila).
select cron.schedule('revtaw-archive', '13 19 * * *', $$ select public.revtaw_call('/api/cron/archive') $$);

-- Check: select jobname, schedule, active from cron.job;
--        select status_code, created from net._http_response order by created desc limit 10;

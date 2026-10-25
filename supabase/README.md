# Supabase setup

RevTaw uses Supabase for PostgreSQL, authentication and private file storage.
Every table is protected with row-level security so a student can only ever
reach their own data.

## 1. Create a project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **publishable** key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - a **secret** key → `SUPABASE_SECRET_KEY` (server only, optional; needed
     for account deletion and the reminder scheduler)
3. Put them in `.env.local` (see `.env.example`). `.env*` files are ignored by
   git on purpose.

## 2. Apply the migrations

Run each file in `supabase/migrations/` **in order** in the SQL editor
(**SQL Editor → New query → paste → Run**), or with the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

| Migration | What it adds |
| --- | --- |
| `0001_profiles.sql` | `profiles` table (display name, onboarding preferences), enums, `updated_at` trigger, automatic profile creation on sign-up, RLS policies |
| `0002_materials.sql` | `subjects`, `folders`, `materials`, `material_chunks`, `material_analyses` with owner-only RLS and composite ownership keys; private `materials` storage bucket (25 MB, allow-listed MIME types) with per-user folder policies |
| `0003_reviewers_quizzes.sql` | `concepts`, `reviewers` + `reviewer_sections`, `quizzes` + `quiz_questions`, `quiz_attempts` + `quiz_answers`, `mistakes` (mistake notebook); owner-only RLS, composite keys, cascades from materials |
| `0004_study.sql` | `study_sessions` + `study_session_items` (session builder, active recall, Feynman, error review, Pomodoro state), `flashcard_decks` + `flashcards` (Leitner box, SM-2 scheduling state) + `flashcard_reviews`; owner-only RLS, composite keys |
| `0005_tutor.sql` | `tutor_conversations` (material-grounded chats, mode, optional study session) + `tutor_messages` (role, content, action, selection, grounding, sources, follow-ups, flashcard); owner-only RLS |
| `0006_mastery.sql` | `concept_mastery` — the adaptive engine's cached mastery, retrieval strength, confidence calibration, next difficulty and next review per concept; owner-only RLS |
| `0007_planner.sql` | `profiles.timezone`; `exams`, `exam_materials`, `study_plans`, `study_tasks` (plan tasks, 1-3-7-14 reviews, custom tasks), `study_goals`, `notifications`; owner-only RLS |
| `0008_methods.sql` | more `study_session_items` kinds plus `format` and `material_id`; `tutor_mode` gains `teach_back`; `routines` (custom study routines); owner-only RLS |
| `0009_methods_part2.sql` | session item kinds `visual`, `link`, `mnemonic`, `loci`, `story`; `study_maps` (mind maps, concept maps, dual-coding visual sets), `mnemonics`, `memory_palaces`; `tutor_messages.visual`; owner-only RLS |
| `0010_gamification.sql` | `xp_events` (XP ledger, idempotent per source key) with a trigger that keeps `profiles.xp` in step, `achievements` (unlocked badges); `notification_kind` gains `achievement` and `level_up`; owner-only RLS |
| `0011_search.sql` | full-text (GIN) indexes for global search over materials, chunks, reviewers and sections, quiz questions, flashcards, concepts and tutor conversations; generated `search_text` columns on `reviewer_sections` and `flashcards` |
| `0012_preferences.sql` | `profiles.preferences` (JSON object by section: appearance, dashboard, tools, ai, study, notifications, assistant; size-capped) and `set_preference_section()` — saves one section atomically, security invoker so RLS applies |
| `0013_planner_fk_fix.sql` | fix: the exam → subject and task → material / session foreign keys clear only their own id column on delete (`set null (column)`), so a material with scheduled reviews or a subject used by an exam can be deleted |
| `0014_planner_activities.sql` | the planner calendar: `study_tasks` gains a start time (local, in the student's time zone), a subject, a priority, notes and a category (study, review, assignment, project, exam, class, other) |
| `0015_reminders.sql` | reminders: `study_tasks.reminder` (+ `reminder_minutes` for a custom one), the `reminders` queue (one row per activity, per-channel delivery state, owner-only RLS), `claim_due_reminders()` for the scheduler (service role only) and the `reminder` notification kind |
| `0016_ai_usage.sql` | each student's daily AI allowance: `ai_usage` (requests and tokens per Philippine day and kind; students read their own rows), `consume_ai_request()` (takes one request from the caller's own allowance, atomically) and `refund_ai_request()` (service role only) |
| `0017_hybrid_search.sql` | turns on `vector` (pgvector) and `pg_trgm`; `material_chunks` gains a BGE-M3 `embedding` (halfvec 1024) and a `simple` full-text vector; `match_material_chunks()` (full-text + trigram + vector search fused by reciprocal rank, security invoker) and `save_chunk_embeddings()` |
| `0018_email_digests.sql` | `email_digests`: one row per student and day, claimed before the daily digest is sent so it never goes out twice; written by the scheduler only |
| `0019_calendar.sql` | `calendar_connections`: the student's Google Calendar link with the refresh token encrypted by the server; students can read the status but never the token (column grant) |
| `0020_privacy_preferences.sql` | a `privacy` preferences section (usage analytics, off by default) accepted by `set_preference_section()` |
| `0021_ai_usage_server_tokens.sql` | token, voice-second and character counts are added only by the server: `add_ai_tokens(user, kind, input, output)` for the service role only |
| `0022_learning_engine.sql` | the learning engine: `mastery_status` gains `developing`; `concept_mastery` keeps P(learned), recall, Elo rating (and where it started), weakness, gates, next step, best status and the concept's FSRS state; FSRS columns on `flashcards` and `flashcard_reviews`; `item_buckets` (shared question difficulty, written by the server only) |
| `0023_material_archive.sql` | the Archive: `material_status` gains `deleted`; `materials.purged_at` (the file, text and analysis deleted permanently 30 days after Delete; the row stays for what was made from it) with a check that a deleted file stays archived; materials archived before get the full 30 days |
| `0024_performance_indexes.sql` | indexes for the per-student reads that scanned every student's rows and for the foreign keys that are cleared or followed when their parent goes, two for the night run, and six duplicates of unique indexes dropped (indexes only; no data changes) |
| `0025_material_storage_guard.sql` | a trigger that refuses a `materials.storage_path` outside the material's own `<user_id>/<material id>/` folder, so the Archive's job (secret key) can only delete a material's own file |
| `0026_rate_limits.sql` | `rate_limits` and `rate_limit_hit()`: rate limits shared by every server instance, with hashed keys (no email or IP address stored); secret key only |
| `0027_fair_shared_jobs.sql` | limits on what one student can take from the scheduler's shared jobs: at most 1,000 pending reminders and 10 claimed per batch, embeddings handed out in turns (`unembedded_chunks_fair()`), chunk text capped at 20,000 characters, answers stamped with the time they were saved, at most 400 first attempts per student for the nightly refit (`bucket_first_attempts()`) |
| `0028_quiz_submit_once.sql` | `quiz_attempts.submit_started_at` so an attempt is graded once; one mistake per question per attempt (duplicates removed, the earliest kept) |
| `0029_nightly_students.sql` | `stale_mastery_students()`: the night run finds every student with stale mastery, longest-waiting first; secret key only |
| `0030_student_elo_totals.sql` | `student_elo_totals()`: the two sums behind a student's overall ability, so grading an answer no longer reads every mastery row (caller's rights) |
| `0031_count_session_answer.sql` | `count_session_answer()`: a study session's answer counters and position move in one update, so answers saved at the same moment all count (caller's rights) |
| `0032_drop_unused_columns.sql` | drops columns nothing wrote: `archived_at` on `subjects`, `folders`, `reviewers`, `quizzes`, `flashcard_decks` and `tutor_conversations` (only materials and exams are archived) and `study_goals.subject_id`; their list indexes are rebuilt without it. It stops and changes nothing if one of those columns holds a value |
| `0033_job_runs.sql` | `job_runs`: when each scheduled job (reminders, digest, embeddings, calendar, engine, archive) last finished, last succeeded and its last error; written by the jobs with the secret key and read by `/api/health`; students cannot read it |
| `0034_ai_provider_budget.sql` | token budgets for an AI provider whose free allowance every student shares (Ollama Cloud): `ai_provider_usage` (all students, per UTC day; kept when an account is deleted) and `ai_provider_student_usage` (per student; deleted with the account); `reserve_ai_provider_tokens()` checks both budgets over the last 32 days and sets a call's estimate aside, one call at a time per provider, and `settle_ai_provider_tokens()` swaps it for the real count; `ai_provider_usage_summary()` for the service check; secret key only |

Never edit an applied migration; add a new numbered file instead. To bring a
project at 0023 up to date in one go, run the update file shipped with the
release (0024–0033 in one transaction: it changes nothing if any part fails).

Leave the Data API's **Max rows** (in the dashboard: **Integrations → Data
API → Settings**) at 1,000 or more, the default. RevTaw reads long lists
1,000 rows at a time and takes a shorter page as the end, so a lower setting
would cut those reads short.

## 3. Configure authentication

**Authentication → URL Configuration**

- Site URL: your deployment origin (e.g. `http://localhost:3000` locally).
- Redirect URLs: add `http://localhost:3000/auth/callback` and the same path on
  your production domain.

**Authentication → Providers → Email**

- Keep **Confirm email** enabled: RevTaw requires email verification before a
  student can sign in.
- Turn on **Secure password change**, so a changed password needs a recent
  sign-in. RevTaw itself sets a new password without the old one only from a
  session that signed in through an email link in the last 15 minutes.

**Authentication → Emails** (RevTaw's email templates)

RevTaw's branded account emails are in `supabase/templates/`, made with the
same design system as the app's own emails (`src/lib/email`). Deploy RevTaw
first: their logo and icons load from `{{ .SiteURL }}/email/`. Then, for each
template below, open it in the dashboard, set the subject, replace the whole
message body (source view) with the file's contents, and save:

| Dashboard template | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirm-signup.html` | Confirm your RevTaw account |
| Reset password | `reset-password.html` | Reset your RevTaw password |
| Change email address | `change-email.html` | Confirm your new RevTaw email |
| Password changed (a security notification: switch it on) | `password-changed.html` | Your RevTaw password was changed |

The default templates work with the `/auth/callback` route, but their links are
used as soon as they are opened, and school or work mail scanners (Microsoft
Safe Links and the like) open every link first, so students find them already
used. RevTaw's templates point at RevTaw's confirm page instead. Opening the
link only shows a button; the link is used when the student presses it, and it
works in any browser or device:

- Confirm sign up:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
- Reset password:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- Change email address:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`

"This link will expire in 1 hour" matches Supabase's default **Email OTP
Expiration** (3600 seconds); if you change it, change `LINK_EXPIRY` in
`src/lib/email/auth-templates.ts` too. After changing an email's design or
words, write the files again and paste the changed ones:

```bash
UPDATE_EMAIL_TEMPLATES=1 npx vitest run src/lib/email/auth-templates.test.ts
# PowerShell: $env:UPDATE_EMAIL_TEMPLATES=1; npx vitest run src/lib/email/auth-templates.test.ts
```

These links always open the Site URL, so during local development a
confirmation link opens the live site; sign in locally afterwards.

## 4. Rate limits

RevTaw counts its own limits (sign-in attempts per address and per account,
sign-ups, reset and verification emails, uploads, exports, search and
generation) in Postgres, shared by every server instance (migration 0026), and
Supabase applies its own limits to sign-up, sign-in and email sending.

**Authentication → Rate Limits**

- Supabase counts by IP address, and RevTaw calls Supabase Auth from its
  server. Turn on **IP Address Forwarding** there: RevTaw then sends each
  student's address in `Sb-Forwarded-For`, so a class signing up from one
  school network is limited per student, not as one. Forwarding works only
  with a new-style secret key (`sb_secret_…`) in `SUPABASE_SECRET_KEY`, not
  with the legacy `service_role` key.
- Raise the defaults to what a class needs at once (for example 150 sign-ups
  and sign-ins per 5 minutes per address); emails stay limited by your SMTP
  plan (Resend's free plan sends 100 a day).

**Authentication → Bot and Abuse Protection**: leave **Enable CAPTCHA
protection** off. RevTaw's optional Cloudflare Turnstile check
(`TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env.example`) is
confirmed by RevTaw's server before it calls Supabase Auth. Each Turnstile
token can be confirmed only once, so turning on Supabase's check as well would
reject sign-ins whenever RevTaw calls Supabase without the secret key.

## 5. Scheduler (optional)

Reminder emails, the daily digest, search embeddings for older materials,
Google Calendar's hourly sync, the learning engine's night run and the
Archive's 30 days run when something calls RevTaw's
`/api/cron/*` routes with `Authorization: Bearer <CRON_SECRET>`.
`schedules.sql` sets this up inside Supabase with pg_cron and pg_net, keeping
the site address and `CRON_SECRET` in Supabase Vault: turn on both
extensions, put your two values into step 2 of the file, run it once in the
SQL editor and clear the values from the editor tab. It is not a migration;
`supabase db push` does not run it. The app needs `CRON_SECRET` and
`SUPABASE_SECRET_KEY` in its environment as well.

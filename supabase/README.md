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
     for account deletion)
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

Migrations are additive. Never edit an applied migration; add a new numbered
file instead.

## 3. Configure authentication

**Authentication → URL Configuration**

- Site URL: your deployment origin (e.g. `http://localhost:3000` locally).
- Redirect URLs: add `http://localhost:3000/auth/callback` and the same path on
  your production domain.

**Authentication → Providers → Email**

- Keep **Confirm email** enabled: RevTaw requires email verification before a
  student can sign in.

**Authentication → Email Templates** (recommended)

The default templates work with the `/auth/callback` route. For links that also
work when the email is opened in a different browser or device than the one
that started the flow, point the templates at the token-hash route instead:

- Confirm signup:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
- Reset password:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- Change email address:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings/account`

## 4. Rate limits

Supabase applies its own limits to sign-up, sign-in and email sending. RevTaw
adds a small per-IP limiter in front of the auth actions as an extra layer.

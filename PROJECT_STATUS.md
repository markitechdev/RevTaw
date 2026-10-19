# RevTaw — Project Status

Living record of what exists, what is being built and what comes next. Read
this first in every development session, then `package.json`,
`supabase/migrations/`, `src/lib/routes.ts` and the relevant components.

_Last updated: 2026-10-19 (Phase 4 complete)_

## Completed

### Phase 1 — Foundation

- **Branding and design tokens** — RevTaw name, motto ("Reviewer na may
  Bitaw."), tagline, logo mark; semantic colour tokens for light and dark in
  `src/app/globals.css`; self-hosted Inter; calm academic style, no gradients.
- **Light/dark mode** — class-based, persisted in `localStorage`
  (`revtaw-theme`), follows the system by default, no flash on load
  (`src/components/theme/`).
- **Landing page** — `/` with hero, benefits, how it works, study methods,
  final call to action (`src/app/(marketing)/`).
- **Database** — `profiles` table with onboarding enums, `updated_at`
  trigger, automatic profile creation on sign-up, owner-only RLS
  (`supabase/migrations/0001_profiles.sql`).
- **Authentication** — register, email verification (with resend), sign in,
  sign out, forgot/reset password, change password; Server Actions with zod
  validation, friendly error mapping, per-IP/per-account rate limiting,
  PKCE callback (`/auth/callback`) and token-hash confirm (`/auth/confirm`)
  routes; session refresh in `src/proxy.ts`.
- **Onboarding** — education level, main goal, preferred session length
  (presets or custom); gated until completed; editable later in Settings.
- **Profile and account settings** — `/settings/profile` (name),
  `/settings/preferences` (study preferences + theme), `/settings/account`
  (change password with re-authentication, delete account with password and
  typed confirmation; deletion runs server-side with the secret key and
  cascades through foreign keys).
- **App shell** — desktop sidebar, mobile top bar + bottom tab bar + full-menu
  drawer (native `<dialog>`), skip link, loading skeleton, error boundary,
  branded 404 (`src/components/app/`).
- **Dashboard shell** — greeting, preference summary, and every section from
  the spec (Continue studying, RevTaw recommendation, streak/focus/flashcards
  due/materials, Due today, Upcoming exams, Recent materials, Weak/Strong
  topics) rendered with useful empty states until later phases provide data.
- **Section placeholders** — Study, Study Methods, Quiz, Flashcards, AI
  Tutor, Notes, Progress, Planner each explain what is coming and in which
  phase.

### Phase 2 — Materials

- **Schema** — `subjects`, `folders`, `materials`, `material_chunks`,
  `material_analyses` with owner-only RLS and composite ownership keys;
  private `materials` bucket (25 MB, allow-listed MIME types) with per-user
  folder policies (`supabase/migrations/0002_materials.sql`).
- **AI provider abstraction** — `src/lib/ai`: Anthropic, OpenAI, Google and a
  deterministic mock behind one interface; fast/strong tiers; JSON helper
  with zod validation and a one-shot repair prompt; keys never reach the
  browser.
- **Upload** — add-material dialog with drag-and-drop (progress, cancel) and
  paste-notes tab; browser uploads straight to the bucket through a signed
  URL; pasted notes become a private text file; subject/folder placement with
  inline subject creation.
- **Processing pipeline** — `POST /api/materials/[id]/process`: byte-level type
  check (magic numbers), SHA-256 deduplication (identical uploads reuse text
  and analysis), extraction (PDF via pdf-parse, DOCX via mammoth, DOC via
  word-extractor, text, images via the vision-capable provider), chunking
  by heading and page, status machine uploading → extracting → analyzing →
  ready/failed with student-facing detail and Retry.
- **AI analysis** — source-grounded prompt producing summary, main topics,
  key concepts by category, definitions, formulas, important facts, exam
  topics, difficulty, study time and 2–4 recommended study methods; coverage
  reported for very long materials; `POST /api/materials/[id]/analyze`
  re-runs it. Materials stay usable when AI is unavailable.
- **Materials page** — subject/folder sidebar with counts, archived view,
  live status badges with polling, empty states; subjects/folders manager
  (create, rename, delete).
- **Viewer** — `/materials/[id]` with Overview (analysis), Content (chunks
  with page ranges) and Original (pdf.js canvas viewer, images, text,
  document download through the same-origin file route) tabs; rename, move,
  archive/unarchive, delete; `last_opened_at` tracking.
- **Dashboard** — last opened material, recent materials, real counts.
- **Data ownership** — deleting a material or the whole account removes the
  stored files as well as the rows.

### Phase 3 — Reviewer and Quiz

- **Schema** — `concepts` (master concept model, one row per distinct name
  per student), `reviewers` + `reviewer_sections`, `quizzes` +
  `quiz_questions`, `quiz_attempts` + `quiz_answers`, `mistakes`; owner-only
  RLS, composite ownership keys so a question/answer/mistake can never point
  at another student's rows (`supabase/migrations/0003_reviewers_quizzes.sql`).
- **Reviewer generator** — `POST /api/reviewers` turns a processed material
  into one of ten formats (complete, summary, bullet notes, key concepts,
  definitions, formula sheet, Q&A, Cornell with fixed Cue/Main/Summary
  sections, cheat sheet, exam reviewer) using the strong model and a
  grounding prompt; failed generations keep a retryable row with a plain
  explanation. `src/lib/reviewers/`.
- **Notes** — `/notes` list and `/notes/[id]` reader with sticky section
  navigation; every section can be edited by hand (markdown) or regenerated
  on its own with optional instructions while the rest stays intact; rename
  and delete; `last_opened_at`. Markdown is rendered by a small safe renderer
  (`src/components/content/markdown.tsx`, no raw HTML or links).
- **Quiz generator** — `POST /api/quizzes` with a configuration dialog:
  question types (identification, multiple choice, true/false, fill in the
  blank, short answer, essay, scenario, case-based, problem solving — any
  mix), count (5/10/20/50/custom), difficulty (easy/medium/hard/mixed),
  default mode, timer, shuffling, feedback timing and an optional topic
  focus. Every question stores its answer, explanation, concept, source
  excerpt and (when found) source chunk; duplicates and malformed items are
  dropped; concepts are upserted into `concepts`. `src/lib/quizzes/`.
- **Attempts** — `/quiz/[id]` (settings, attempt history, start dialog) and
  `/quiz/[id]/attempt/[attemptId]` runner: one question at a time with a
  navigator, per-question server-saved answers with confidence and response
  time, practice mode with immediate feedback (question locked once the
  answer is shown) or deferred feedback, exam mode with countdown, forced
  shuffling, no hints, auto-submission on expiry (also on reload after the
  deadline). Correct answers are never sent to the browser before grading.
- **Grading** — objective types graded on the server (lenient text matching
  for identification/fill-ins); open types graded in one model call against
  the model answer and rubric with partial credit; if the AI is unavailable
  the student self-checks against the model answer on the results page.
- **Results** — score and percentage, correct count, duration, concept
  breakdown (needs work / solid), full question review with the student's
  answer, correct/model answer, rubric, feedback, explanation, source quote,
  confidence and time; retake in one click.
- **Mistake notebook** — `/quiz/mistakes`: every incorrect (or blank) answer
  is filed automatically with concept and material, repeated concepts are
  called out, each entry can be classified (misunderstood, forgotten,
  calculation, misread, confused concepts) and marked learned/reopened.
  Deleting a quiz keeps notebook entries.
- **Dashboard** — weak topics (accuracy < 60%), strong topics, recent quiz
  scores, open-mistake count, and a recommendation that names the weak
  concepts.
- **Material overview** — Study tools card with Create reviewer / Create quiz
  and the reviewers and quizzes already built from that material.

### Phase 4 — Core study

- **Schema** — `study_sessions` (method, goal, planned minutes, persisted
  `state`, `summary`, focus time, item counters, optional quiz attempt),
  `study_session_items` (recall prompts, Feynman concepts, retested mistakes
  with response, AI analysis, confidence, time), `flashcard_decks`,
  `flashcards` (Leitner box, ease, interval, repetitions, lapses, due date,
  favorite, suspended) and `flashcard_reviews`
  (`supabase/migrations/0004_study.sql`).
- **Flashcards** — `POST /api/flashcards` writes term/definition, question
  and fill-in cards grounded in a material; decks page, deck detail with box
  distribution, editable cards, favorites, suspend, rename/delete; review
  runner (flip, Don't know / Hard / Medium / Easy with the interval each
  rating would set, keyboard shortcuts, hints, repeats within the session,
  shuffle, favorites-only); `/flashcards/review` for everything due across
  decks. `src/lib/flashcards/`.
- **Spaced repetition** — SM-2 style ease/interval on a five-box Leitner
  ladder (today, 1, 3, 7… days; lapses reset to box 1), unit-tested
  (`scheduler.ts`); every rating is saved at once with a review log; the
  dashboard shows cards due and the decks they belong to.
- **Study session builder** (§26) — `/study`: material → time (presets or
  custom, default from the profile) → goal → method, with recommendations
  per goal and methods disabled when they cannot run; in-progress sessions
  resume; recent sessions with accuracy. `src/lib/study/`.
- **Active recall** — prompts generated from the material and weighted
  toward weak concepts and recent mistakes; the answer stays hidden until
  the student writes theirs; the AI lists correct, missing and incorrect
  points with a score; confidence and response time recorded; misses go to
  the mistake notebook.
- **Error review** — open notebook entries come back as recall prompts; a
  correct retest marks the mistake learned (notebook has a Retest button).
- **Feynman technique** — explain a concept for a beginner, receive
  correct/missing/incorrect/unnecessary-complexity analysis, improve once,
  then see the ideal explanation; low final scores are filed as
  "misunderstood concept" mistakes.
- **Practice testing** — generates a mixed test (multiple choice,
  identification, true/false, short answer) with deferred feedback and an
  optional timer, run through the quiz runner; the session closes with a
  summary derived from the attempt and links back to the full review.
- **Pomodoro** — presets 15/5, 25/5, 45/10, 50/10, 60/15 or custom, long
  break every four rounds, pause/resume/skip break, progress restored after
  a refresh, completed rounds credited to focus time.
- **Session summary** (§29) — duration, topics, answered/correct/incorrect,
  accuracy, improvement vs. the previous session of the same kind, weak and
  strong concepts, suggested next activity, next scheduled review; saved on
  every session.
- **Study Methods page** (§15) — every method with explanation, how it
  helps, best use cases, suggested duration, what changes in a session and a
  real Start button; unimplemented methods say which phase adds them.
- **Dashboard** — study streak (sessions, quiz attempts, flashcard reviews),
  focus time today / 7 days, flashcards due, "Due today" decks, and a
  recommendation that names the weak concept and starts the right session.

## In Progress

- Nothing at the moment. Phase 5 starts next.

## Next (priority order)

1. **Phase 5 — AI tutor**: document-aware chat grounded in the selected
   material, highlight-and-ask from the viewer, "explain like I'm a
   beginner", examples, step-by-step guided tutoring, Socratic questioning,
   elaborative interrogation and self-explanation sessions.
2. **Phase 6 — Adaptive intelligence**: mastery and retrieval strength per
   concept (quiz answers, recall items and flashcard reviews already carry
   correctness, difficulty, confidence and response time), weakness
   detection, difficulty adaptation, smart study sessions.
3. **Phase 7 — Planner**: exam dates, availability, generated daily plans,
   cram mode, 1-3-7-14 reviews.
4. Phases 8–10 as listed in the spec (advanced methods such as blurting,
   interleaving, worked examples, mind maps; analytics/gamification; export).

## Database

| Table | Purpose | Ownership |
| --- | --- | --- |
| `public.profiles` | One row per `auth.users` row: display name, education level, main goal, preferred session minutes, onboarding timestamp | RLS: owner may select/insert/update; no delete policy (cascade from `auth.users`) |
| `public.subjects` | Top-level organisation (name, colour, archived_at) | owner full access; `(id, user_id)` unique for composite FKs |
| `public.folders` | Grouping inside a subject (chapter, topic…) | owner full access; FK `(subject_id, user_id)` |
| `public.materials` | One upload or note: title, source, file metadata, `storage_path`, `content_hash`, status + detail, counts, `last_opened_at`, `archived_at` | owner full access; composite FKs to subject and folder (folder must belong to the subject) |
| `public.material_chunks` | Ordered extracted text with heading and page range | owner full access; cascade from material |
| `public.material_analyses` | One AI analysis per material: summary, difficulty, minutes, coverage, validated `data` JSON, provider/model | owner full access; cascade from material |
| `public.concepts` | Master concept list per student (`name`, `normalized_name`, origin material/subject) | owner full access; unique `(user_id, normalized_name)` |
| `public.reviewers` | Generated reviewer: kind, title, status + detail, provider/model, `last_opened_at`, `archived_at` | owner full access; cascade from material |
| `public.reviewer_sections` | Ordered sections (heading, markdown content, `edited_at`, `regenerated_at`) | owner full access; cascade from reviewer |
| `public.quizzes` | Generated quiz: title, `config` JSON, status + detail, provider/model, `question_count` | owner full access; cascade from material |
| `public.quiz_questions` | Question: type, difficulty, prompt, `options`, `answer` JSON, explanation, concept, source excerpt/chunk, points | owner full access; cascade from quiz; concept FK set null |
| `public.quiz_attempts` | One run of a quiz: mode, status, time limit, `question_order`, score/max/correct, timestamps | owner full access; cascade from quiz |
| `public.quiz_answers` | One answer per attempt+question: `response` JSON, correctness, score, feedback, `graded_by` (auto/ai/self), confidence, response time | owner full access; unique `(attempt_id, question_id)` |
| `public.mistakes` | Mistake notebook entry: question/answer text, explanation, error type, `resolved_at`; links to question/attempt/concept/material are set null when those go away | owner full access |
| `public.study_sessions` | One study session: method, goal, planned minutes, title, status, `state` (resume data), `summary` (§29), focus seconds, item counters, optional `quiz_attempt_id` | owner full access; material/subject/attempt FKs set null |
| `public.study_session_items` | Prompts worked through in a session (recall, feynman, mistake): model answer, key points, response, AI `analysis`, correctness, score, confidence, time, attempts | owner full access; cascade from session; concept/mistake FKs set null |
| `public.flashcard_decks` | Generated deck: title, status + detail, provider/model, card count | owner full access; cascade from material |
| `public.flashcards` | Card: front/back/hint, concept, source, favorite, suspended, Leitner `box`, `ease`, `interval_days`, `repetitions`, `lapses`, `due_at`, last review/rating | owner full access; cascade from deck; partial index on due cards |
| `public.flashcard_reviews` | Review log: rating, response time, box before/after, interval, due date, optional session | owner full access; cascade from card |
| `storage.objects` (bucket `materials`) | Private files under `<user_id>/<material_id>/<file>` | policies on first path segment = `auth.uid()` |

Enums: `education_level`, `study_goal`, `material_source`, `material_status`,
`difficulty_level`, `reviewer_kind`, `generation_status`, `question_type`,
`question_difficulty`, `quiz_mode`, `attempt_status`, `confidence_level`,
`mistake_type`, `session_status`, `session_goal`, `flashcard_rating`. Helper functions: `public.set_updated_at()`,
`public.handle_new_user()` (security definer, pinned `search_path`).

Types for queries live in `src/lib/supabase/database.types.ts` (hand-written
in `supabase gen types` format; regenerate with the CLI when the project is
linked).

## Architecture

- **Next.js 16 App Router**, React 19, TypeScript, Tailwind CSS v4.
  `cacheComponents` is off (dynamic, cookie-based pages). Route groups:
  `(marketing)`, `(auth)`, `(onboarding)`, `(app)`.
- **Supabase** via `@supabase/ssr`. `src/lib/supabase/server.ts` for Server
  Components/Actions/Route Handlers, `client.ts` for Client Components,
  `admin.ts` (secret key, server-only) for privileged operations.
- **Authorization** — `src/proxy.ts` refreshes the session and redirects; it
  is a convenience layer only. Every Server Action and protected page calls
  `getCurrentUser()` (JWT verified with `getClaims()`), and the database
  enforces ownership with RLS.
- **Forms** — Server Actions + `useActionState`; shared `ActionState` shape
  (`src/lib/forms/action-state.ts`); zod schemas in `src/lib/validation/`;
  field-level errors rendered with `aria-describedby`.
- **Rate limiting** — in-memory fixed window per server instance
  (`src/lib/rate-limit.ts`), in addition to Supabase's own limits. Swap the
  store for Redis when running several instances.
- **Routes** — all paths come from `src/lib/routes.ts`; navigation items from
  `src/components/app/nav-items.ts`.
- **Email links** — `/auth/callback` (PKCE `code`) and `/auth/confirm`
  (`token_hash`). The latter works across browsers/devices; see
  `supabase/README.md` for email templates. Redirects use
  `NEXT_PUBLIC_SITE_URL`, never the internal request origin.
- **Materials pipeline** — `src/lib/materials/`: `detect.ts` (magic numbers),
  `extract.ts` (per-type extraction), `chunk.ts` (heading/page aware
  chunking), `analyze.ts` (prompt + transcript budget), `pipeline.ts`
  (status machine, dedup, analysis step), `storage.ts` (object paths,
  signed uploads, removal). Processing runs inside route handlers with
  `maxDuration = 120`; move it to a queue/edge function if materials
  regularly exceed that.
- **AI** — `src/lib/ai/`: provider chosen by `AI_PROVIDER` or the first key
  present; `mock` is automatic in development without keys and must be set
  explicitly in production. `generateJson()` validates with zod and asks the
  model to repair once. Student context (education level, goal) is passed
  to prompts.
- **Files to the browser** — never public or signed download URLs; the
  same-origin route `/api/materials/[id]/file` checks ownership and streams
  the object with `no-store`, `nosniff` and a sandboxed CSP.
- **Reviewers** — `src/lib/reviewers/`: `kinds.ts` (catalog + guidance),
  `generate.ts` (prompts, zod schemas), `service.ts` (create/retry/regenerate
  section), `queries.ts`, `actions.ts` (edit, rename, delete). Generation runs
  in route handlers (`maxDuration = 120`).
- **Quizzes** — `src/lib/quizzes/`: `types.ts` (type catalog, config schema,
  answer/response JSON shapes, shared by client and server), `generate.ts`
  (prompt + per-type validation + clean-up), `grade.ts` (objective grading,
  lenient text matching, batched AI grading), `service.ts` (create/retry,
  start attempt, save answer, submit, self-grade, expiry), `queries.ts`
  (list/detail, runner view without answers, results view, mistakes, concept
  performance), `actions.ts` (Server Actions). Option order is shuffled per
  attempt with a seeded shuffle so results match what the student saw.
- **Concepts** — `src/lib/concepts/service.ts` upserts names generated by
  the model into the per-student `concepts` table; every later system
  (mistakes, mastery) points at those rows (spec §51/§56 consistency rule).
- **Flashcards** — `src/lib/flashcards/`: `scheduler.ts` (pure, tested
  SM-2/Leitner scheduling), `generate.ts`, `service.ts` (deck generation,
  `reviewCard` = reschedule + log + session counters), `queries.ts` (decks
  with due counts, review queues, due counts), `actions.ts`.
- **Study sessions** — `src/lib/study/`: `methods.ts` (catalog), `catalog.ts`
  (per-method behaviour, goals, availability, builder recommendations),
  `sessions.ts` (create/complete/summary, improvement vs. previous session),
  `ai.ts` (recall prompts, recall comparison, Feynman concepts and
  analysis), `service.ts` (starting each method, item flows, Pomodoro state,
  practice-testing sync), `queries.ts` (sessions, activity stats: streak and
  focus time), `actions.ts`. Runners live in `src/components/study/` and share
  `SessionHeader` and `SessionSummaryCard` (§52 reusable components).

## Known Issues / Limitations

- Rate limit counters reset on deploy and are per instance.
- Email address changes are not offered in the UI yet (`/auth/confirm`
  already supports `email_change`).
- Account deletion is disabled until `SUPABASE_SECRET_KEY` is configured; the
  UI says so.
- Analysis sends at most ~140k characters of a material to the model; longer
  materials are analyzed partially and the coverage is shown. Map-reduce
  analysis for very long books is a later improvement.
- Image materials need a vision-capable provider (all three real providers
  qualify); without AI they fail with a clear message.
- The Content tab renders every chunk at once; very large materials would
  benefit from pagination.
- Scanned PDFs without a text layer are rejected with guidance to upload
  pages as images (OCR of PDF pages is a later improvement).
- Reviewer and quiz generation run inside a single request (up to 120 s).
  Very large question counts on long materials may need a background job.
- Quiz questions are generated from the whole material (optionally focused
  by a free-text topic); picking individual chapters/chunks as the source is
  a later refinement.
- Concept performance on the dashboard is accuracy over recent answers;
  mastery, retrieval strength and difficulty adaptation arrive in Phase 6.
- Session items and flashcard generation also run inside a single request
  (`maxDuration = 120` for routes; Server Actions for sessions). Very long
  materials rely on the transcript budget.
- The streak counts UTC days; per-user time zones arrive with the planner.
- "Smart Study" (RevTaw picking the method automatically) and routines are
  Phase 6/8 work; the builder recommends methods per goal today.

## Environment Requirements

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Required | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable/anon key (public; RLS protects data) |
| `SUPABASE_SECRET_KEY` | optional | Server-only privileged client (account deletion) |
| `NEXT_PUBLIC_SITE_URL` | recommended | Absolute origin for email links and auth redirects |
| `AI_PROVIDER` | optional | `anthropic`, `openai`, `google` or `mock`; auto-detected from keys when empty |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` | one needed for AI features | Server-only provider keys |
| `AI_MODEL_FAST` / `AI_MODEL_STRONG` | optional | Override the default model per tier |

Supabase dashboard settings needed: email confirmations on, Site URL and
`/auth/callback` redirect URL (see `supabase/README.md`).

## Testing

Flows verified end to end against a local Supabase-compatible stack
(PostgreSQL 16 + PostgREST + an Auth emulator):

- Register → verify → sign in → sign out → forgot → reset → sign in again
- Unconfirmed sign-in, resend verification with rate limit, expired/used links
- Open-redirect protection on `next`
- Onboarding gating and validation, preference edits, profile edits
- Change password (re-auth, other sessions revoked), delete account (cascade
  plus storage clean-up)
- RLS: a user cannot read, update or insert another user's profile,
  materials, chunks, analyses or storage objects; composite keys reject
  cross-user subject/folder links; anon has no access
- Materials: PDF (real multi-page), DOCX, pasted notes, image (vision), fake
  PDF rejected by byte check, retry, deduplication, subject filter, viewer
  tabs, re-analyze, rename/move/archive/delete, subjects/folders manager
- Reviewers: generate (complete, Cornell with fixed sections, Q&A,
  definitions), edit a section, regenerate a section with instructions,
  rename, delete, unknown material rejected, mobile layout
- Quizzes: anonymous/invalid/unknown-material requests rejected; mixed quiz
  of five types; practice attempt with immediate feedback (wrong answer shows
  the correct answer and explanation, checked question locked on revisit,
  confidence and response time stored, AI-graded short answer); results
  score/percentage/concept breakdown; mistake filed; exam attempt with timer,
  blank questions confirmed and filed; submitted attempts always render
  results; mistake notebook classify/resolve/learned view; dashboard weak
  topics and recent scores; rename; delete keeps notebook entries
- Flashcards: deck generation from the material page, card edit, favorite,
  review with keyboard shortcuts (Don't know repeats within the session),
  summary and session row, review log, boxes/due dates updated, review-all
  empty state, dashboard due count, study-all with shuffle, favorites mode,
  rename, delete keeps sessions
- Study sessions: builder from the methods page, active recall (prompt
  matching, hidden model answers, correct/missing comparison, confidence and
  time, summary, mistake filed, refresh resumes, early end), error review
  (retest marks the mistake learned), Feynman (two rounds, ideal explanation
  revealed only at the end), practice testing (timed test through the quiz
  runner, summary from the attempt), Pomodoro (countdown, pause/resume,
  refresh restore, focus time), study page and dashboard streak/focus
- Unit tests (`npm test`): JSON extraction, chunking, content helpers,
  analysis transcript, markdown renderer, quiz distribution/grading/config,
  the mock quiz generator and the flashcard scheduler

Commands: `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest unit tests),
`npm run build`.

# RevTaw — Project Status

Living record of what exists, what is being built and what comes next. Read
this first in every development session, then `package.json`,
`supabase/migrations/`, `src/lib/routes.ts` and the relevant components.

_Last updated: 2026-10-19 (Phase 2 complete)_

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

## In Progress

- Nothing at the moment. Phase 3 starts next.

## Next (priority order)

1. **Phase 3 — Reviewer and Quiz**: migration `0003` (reviewers with
   sections, quizzes, questions, attempts, answers, concepts); reviewer
   generator (complete reviewer, summary, bullet notes, key concepts,
   definitions, formula sheet, Q&A, Cornell, cheat sheet, exam reviewer)
   with editable, individually regenerable sections; quiz generator
   (identification, multiple choice, true/false, fill-blank, short answer,
   essay, scenario, case, problem solving, mixed) with attempts, scoring,
   results and concept-level mistake tracking; Notes and Quiz pages.
2. **Phase 4 — Core study**: session builder, study methods that change
   session behaviour, flashcards with spaced repetition, Pomodoro, mistake
   notebook.
3. Phases 5–10 as listed in the spec (AI tutor, adaptive learning, planner,
   advanced methods, analytics/gamification, export).

## Database

| Table | Purpose | Ownership |
| --- | --- | --- |
| `public.profiles` | One row per `auth.users` row: display name, education level, main goal, preferred session minutes, onboarding timestamp | RLS: owner may select/insert/update; no delete policy (cascade from `auth.users`) |
| `public.subjects` | Top-level organisation (name, colour, archived_at) | owner full access; `(id, user_id)` unique for composite FKs |
| `public.folders` | Grouping inside a subject (chapter, topic…) | owner full access; FK `(subject_id, user_id)` |
| `public.materials` | One upload or note: title, source, file metadata, `storage_path`, `content_hash`, status + detail, counts, `last_opened_at`, `archived_at` | owner full access; composite FKs to subject and folder (folder must belong to the subject) |
| `public.material_chunks` | Ordered extracted text with heading and page range | owner full access; cascade from material |
| `public.material_analyses` | One AI analysis per material: summary, difficulty, minutes, coverage, validated `data` JSON, provider/model | owner full access; cascade from material |
| `storage.objects` (bucket `materials`) | Private files under `<user_id>/<material_id>/<file>` | policies on first path segment = `auth.uid()` |

Enums: `education_level`, `study_goal`, `material_source`, `material_status`,
`difficulty_level`. Helper functions: `public.set_updated_at()`,
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

Commands: `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest unit tests),
`npm run build`.

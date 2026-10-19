# RevTaw — Project Status

Living record of what exists, what is being built and what comes next. Read
this first in every development session, then `package.json`,
`supabase/migrations/`, `src/lib/routes.ts` and the relevant components.

_Last updated: 2026-10-19 (Phase 1 complete)_

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
- **Section placeholders** — Materials, Study, Study Methods, Quiz,
  Flashcards, AI Tutor, Notes, Progress, Planner each explain what is coming
  and in which phase.

## In Progress

- Nothing at the moment. Phase 2 starts next.

## Next (priority order)

1. **Phase 2 — Materials**: migration `0002` (subjects, folders, materials,
   chunks, analysis, storage policies), private bucket, drag-and-drop upload
   with MIME/magic-byte/size validation, processing pipeline
   (uploading → extracting → analyzing → ready/failed with retry), text
   extraction (PDF, DOCX, images via multimodal AI, pasted text), AI provider
   abstraction (server-side keys only), material organisation and viewer.
2. **Phase 3 — Reviewer and Quiz**: editable reviewers with per-section
   regeneration, quiz generation, attempts, scoring, results, concept-level
   mistake tracking.
3. **Phase 4 — Core study**: session builder, study methods that change
   session behaviour, flashcards with spaced repetition.
4. Phases 5–10 as listed in the spec (AI tutor, adaptive learning, planner,
   advanced methods, analytics/gamification, export).

## Database

| Table | Purpose | Ownership |
| --- | --- | --- |
| `public.profiles` | One row per `auth.users` row: display name, education level, main goal, preferred session minutes, onboarding timestamp | RLS: owner may select/insert/update; no delete policy (cascade from `auth.users`) |

Enums: `education_level`, `study_goal`. Helper functions:
`public.set_updated_at()`, `public.handle_new_user()` (security definer,
pinned `search_path`).

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

## Known Issues / Limitations

- Rate limit counters reset on deploy and are per instance.
- Email address changes are not offered in the UI yet (`/auth/confirm`
  already supports `email_change`).
- Account deletion is disabled until `SUPABASE_SECRET_KEY` is configured; the
  UI says so.
- Material/storage clean-up on account deletion will be added with Phase 2.

## Environment Requirements

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Required | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable/anon key (public; RLS protects data) |
| `SUPABASE_SECRET_KEY` | optional | Server-only privileged client (account deletion) |
| `NEXT_PUBLIC_SITE_URL` | recommended | Absolute origin for email links and auth redirects |

Supabase dashboard settings needed: email confirmations on, Site URL and
`/auth/callback` redirect URL (see `supabase/README.md`).

## Testing

Flows verified end to end against a local Supabase-compatible stack
(PostgreSQL 16 + PostgREST + an Auth emulator):

- Register → verify → sign in → sign out → forgot → reset → sign in again
- Unconfirmed sign-in, resend verification with rate limit, expired/used links
- Open-redirect protection on `next`
- Onboarding gating and validation, preference edits, profile edits
- Change password (re-auth, other sessions revoked), delete account (cascade)
- RLS: a user cannot read, update or insert another user's profile; anon has
  no access

Commands: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

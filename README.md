# RevTaw

**Reviewer na may Bitaw.** A reviewer that delivers.

RevTaw is an AI-powered personal learning system for students: upload class
materials, turn them into reviewers, quizzes, flashcards and guided study
sessions, and let RevTaw track what you know, what you keep getting wrong,
and what to study next.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL, Auth, Storage, Row-Level Security)
- Server-side AI provider abstraction (keys never reach the browser)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

Open http://localhost:3000. Create a Supabase project and apply the migrations
in `supabase/migrations/` first — see [`supabase/README.md`](./supabase/README.md)
for the dashboard settings (email confirmation, redirect URLs, templates).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Structure

```
src/app/(marketing)   landing page
src/app/(auth)        login, register, verify, forgot/reset password
src/app/(onboarding)  first-run study profile
src/app/(app)         signed-in app: dashboard, materials, study, settings…
src/app/auth          email-link route handlers (callback, confirm)
src/components        ui primitives, forms, app shell, feature components
src/lib               supabase clients, validation, actions, routes, env
supabase/migrations   SQL migrations (apply in order)
```

## Project status

See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for what is completed, in
progress, next, and the environment variables each feature needs.

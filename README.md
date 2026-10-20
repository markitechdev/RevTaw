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

AI features (material analysis, image transcription, reviewer and quiz
generation, grading of open answers) need one provider key in `.env.local`
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY`). Without a
key, development uses a built-in mock provider so the rest of the app keeps
working.

## What works today

- Accounts, onboarding and settings (Phase 1)
- Materials: upload PDF/DOCX/images/notes, extraction, AI analysis with
  study-method recommendations, organisation by subject and folder (Phase 2)
- Reviewers in ten formats with editable, individually regenerable sections
  (Phase 3)
- Quizzes with nine question types, practice and exam modes, timers,
  server-side grading, results by concept and an automatic mistake notebook
  (Phase 3)
- Study sessions: builder by material, time, goal and method; active recall,
  Feynman, practice testing, error review and Pomodoro, each with a saved
  summary; flashcards with spaced repetition (Leitner boxes), streak and
  focus-time tracking (Phase 4)
- AI tutor grounded in your materials: answers cite their sources and say
  when the material does not cover a question; quick actions (explain,
  simplify, example, analogy, quiz me, guide me…), highlight-and-ask inside
  materials and notes, Socratic / elaborative / self-explanation sessions
  (Phase 5)
- Adaptive intelligence: mastery and recall strength per concept from every
  answer, weakness and confidence analysis (misconceptions vs. unsure but
  right), adaptive quiz difficulty, a progress page, recommendations that
  say why, and Smart Study sessions that RevTaw plans from your data
  (Phase 6)
- Planner: exam countdowns with readiness, generated day-by-day plans
  (coverage, 1-3-7-14 reviews, practice tests, exam simulation, cram mode)
  that adjust to missed days and scores, a due-today list that starts
  sessions and closes tasks, study goals, scheduled reviews and an
  in-app reminder feed (Phase 7)
- Advanced study methods: retrieval practice in eight formats, rapid,
  cumulative and interleaved review, blurting, chunking, question
  generation, teach-back with an AI learner, mixed practice, exam
  simulation and custom study routines (Phase 8, part 1)

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (vitest) |

## Structure

```
src/app/(marketing)   landing page
src/app/(auth)        login, register, verify, forgot/reset password
src/app/(onboarding)  first-run study profile
src/app/(app)         signed-in app: dashboard, materials, study, methods,
                      quiz, flashcards, tutor, notes, progress, settings…
src/app/auth          email-link route handlers (callback, confirm)
src/app/api           route handlers (material processing, analysis, files,
                      reviewer and quiz generation)
src/components        ui primitives, forms, app shell, feature components
src/lib               supabase clients, ai providers, materials pipeline,
                      reviewers, quizzes, flashcards, study sessions, tutor,
                      adaptive engine (mastery, recommendations, smart study),
                      planner (exams, plans, tasks, goals), notifications,
                      concepts, validation, routes, env
supabase/migrations   SQL migrations (apply in order)
```

## Project status

See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for what is completed, in
progress, next, and the environment variables each feature needs.

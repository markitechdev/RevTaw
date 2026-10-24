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

In VS Code, **Run and Debug → Start RevTaw** does the same with one click: it
runs `npm install`, starts the dev server and opens the app in your browser
(`.vscode/launch.json`; "skip install" restarts faster).

AI features (material analysis, image transcription, reviewer and quiz
generation, grading, Tamari) run on the server through a router: Groq first,
then Cloudflare Workers AI (both have free tiers), then Anthropic or OpenAI
if you add a paid key, then a local Ollama. Put `GROQ_API_KEY`,
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env.local`; each
student gets a daily AI allowance (`AI_DAILY_LIMITS`, migration 0016).
Without any key, development uses a built-in mock provider so the rest of
the app keeps working. While signed in to `npm run dev`, open
`/api/system/services?live=1` to check each configured service.

Planner reminders reach the in-app bell (and the browser, while RevTaw is
open) without any setup. Email reminders and the daily study digest are
optional: set Resend (`RESEND_API_KEY`, `EMAIL_FROM` on a domain you own) and
the scheduler (`CRON_SECRET`, `SUPABASE_SECRET_KEY`, and `supabase/schedules.sql`
or another cron calling the `/api/cron/*` routes) — see `.env.example`. The
same scheduler runs the learning engine at night (`/api/cron/engine`: question
difficulty and exam boosters) and empties the Archive (`/api/cron/archive`:
materials deleted 30 days ago); without it, mastery still refreshes and
expired Archive items are still deleted whenever a student opens RevTaw.
Also optional: Filipino read-aloud through Azure AI Speech
(`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`), Google Calendar sync through
Google's own OAuth (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`CALENDAR_TOKEN_KEY`) and opt-in usage analytics on PostHog EU
(`POSTHOG_KEY`). In production set `NEXT_PUBLIC_SITE_URL` so emails and
calendar events link back to RevTaw. Credentials stay in server environment
variables only.

## Deploying

RevTaw is built for Vercel. `vercel.json` runs the server code in Sydney
(`syd1`), next to the Supabase project, because every page makes a few dozen
database requests; if your Supabase project is in another region, change it
to the matching one ([Vercel's region list](https://vercel.com/docs/regions)).
Vercel's CDN caches the hashed static files and compresses responses, and it
adds function instances under load, so there is no CDN, compression or load
balancer to set up. Keep Supabase's Data API **Max rows** at 1,000 or more
(the default): long reads go 1,000 rows at a time.

## What works today

- Accounts, onboarding and settings (Phase 1)
- Materials: upload PDF/DOCX/images/notes, extraction, AI analysis with
  study-method recommendations, organisation by subject and folder (Phase 2);
  Delete moves a material to the Archive for 30 days, and deleting it
  permanently removes the file but keeps everything made from it
- Reviewers in ten formats with editable, individually regenerable sections
  (Phase 3)
- Quizzes with nine question types, practice and exam modes, timers,
  server-side grading, results by concept and an automatic mistake notebook
  (Phase 3)
- Study sessions: builder by material, time, goal and method; active recall,
  Feynman, practice testing, error review and Pomodoro, each with a saved
  summary; flashcards with spaced repetition (now FSRS, shown as Leitner
  boxes), streak and focus-time tracking (Phase 4)
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
  simulation and custom study routines (Phase 8, part 1); worked and faded
  worked examples, practice problems, scenario- and case-based learning,
  SQ3R and PQ4R guided reading, dual coding with rebuild exercises,
  editable mind and concept maps with quizzes, mnemonics with a memory aids
  library, memory palaces, the story method and pre-test → study →
  post-test with the improvement shown (Phase 8, part 2)
- Analytics and gamification: a progress page with understandable charts
  (study time, answers, quiz scores, reviews, performance by subject, topic,
  difficulty and confidence), a mastery map with a recommended session per
  concept, XP and levels earned from evidence of learning, badges and
  milestones, streaks and daily/weekly goals (Phase 9)
- Export any reviewer, quiz (with or without the answer key), result sheet,
  flashcard deck, exam plan, the mistake notebook or a progress report as
  PDF, Word or a printable page; global search across documents, notes,
  topics, questions, flashcards and tutor conversations; accessibility
  (axe-clean, keyboard and screen-reader friendly), security and
  performance reviews (Phase 10)
- A youthful, less crowded design you can make your own (UI/UX phase): a
  typed hero on the landing page, theme colors (RevTaw Purple, Blue, Green,
  Orange, Pink, Red, Teal or your own, contrast-safe in light and dark),
  reduced motion, a dashboard you arrange, grouped navigation with pinned
  tools and a Ctrl/Cmd+K command menu, AI preferences (answers in English,
  Filipino, Taglish or another language), chips and simple-first forms,
  **Tamari** — RevTaw's pixel-art study companion, at the start of your
  "Continue studying" card on Home with a line from your own data when you
  click it ("May 3 reviews ka today. Unahin natin Binary Trees?"), a chat
  button on every other page, planning your free minutes ("20 minutes lang
  ako. Bahala ka na." →
  Tamari's 20-Minute Bitaw) and taking typed or **voice** requests in
  English, Filipino or Taglish ("Quiz me about Chapter 4", "Move this to
  Friday") — and a **planner calendar** with activities and reminders by
  bell, browser and email
- Services behind it all (API integrations round): AI routed across Groq,
  Cloudflare Workers AI, paid keys and a local Ollama with a daily
  allowance per student; Tamari finding passages by meaning as well as
  words (BGE-M3 embeddings + pgvector hybrid search, Filipino and Taglish
  included); voice typing and Filipino read-aloud on browsers that lack
  them; a daily study digest and one-click unsubscribe by email (Resend);
  a "RevTaw Study" calendar in Google Calendar; opt-in, content-free usage
  analytics; and a service check at `/api/system/services`
- The learning engine (learning engine round): mastery is the chance you've
  learned a concept times how well you can recall it today (Bayesian
  Knowledge Tracing × FSRS), held back until there is real evidence and
  shown in six states (Needs foundation, Learning, Developing, Strong,
  Mastered) with the step still missing; flashcards scheduled by FSRS-6
  with short learning steps; question difficulty matched to you with Elo
  and shared difficulty buckets refit every night; Tamari's plan and the
  recommendations ranked by weakness, fading recall and your next exam,
  with the study method picked by a rule table that says why; and an exam
  booster two days before an exam for what would otherwise fade
- Faster and right at any size (performance round): about 35 KB less
  JavaScript on every signed-in page, the command menu loaded after the
  page, recompressed images, database indexes where reads scanned (0024),
  long lists a page at a time, loading placeholders shaped like each page,
  fewer re-renders, smaller page data, and streaks, due counts, goals and
  Progress read in full past Supabase's 1,000-row limit

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
src/app/(app)         signed-in app: dashboard, materials, study (sessions,
                      memory aids), methods, quiz, flashcards, tutor, notes,
                      progress, planner, settings…
src/app/auth          email-link route handlers (callback, confirm)
src/app/api           route handlers (material processing, analysis, files,
                      reviewer, quiz and flashcard generation, tutor, export,
                      quick search, reminders, voice, Google Calendar,
                      email unsubscribe, the scheduler's /api/cron/* jobs
                      and the /api/system/services check)
src/components        ui primitives, forms, app shell, Tamari, feature
                      components
src/lib               supabase clients, ai providers, materials pipeline,
                      reviewers, quizzes, flashcards, study sessions, tutor,
                      learning engine (FSRS, BKT, Elo, priority, method
                      rules), adaptive layer (mastery, recommendations, smart
                      study, the night run),
                      planner (exams, plans, tasks, goals, calendar),
                      reminders, notifications and email, preferences and
                      theme, assistant context, voice, analytics,
                      gamification, export, search, concepts, validation,
                      routes, env
supabase/migrations   SQL migrations (apply in order)
supabase/schedules.sql  pg_cron jobs for the scheduler (run once, optional)
```

## Project status

See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for what is completed, in
progress, next, and the environment variables each feature needs.

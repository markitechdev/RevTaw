# RevTaw — Project Status

Living record of what exists, what is being built and what comes next. Read
this first in every development session, then `package.json`,
`supabase/migrations/`, `src/lib/routes.ts` and the relevant components.

_Last updated: 2026-10-20 (Phase 9 complete)_

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

### Phase 5 — AI tutor

- **Schema** — `tutor_conversations` (material, optional study session,
  mode, message count) and `tutor_messages` (role, content, quick action,
  highlighted selection, grounding level, cited sources, additional
  explanation, follow-up suggestions, flashcard draft)
  (`supabase/migrations/0005_tutor.sql`).
- **Document-aware chat** — `/tutor` and `/tutor/[id]`: conversations tied
  to a material (or general); `POST /api/tutor/conversations` and
  `.../[id]/messages`. The context selector (`src/lib/tutor/context.ts`,
  unit-tested) picks the passages that match the question and the selected
  text within a character budget, so every answer cites real sections.
- **Source-grounded answers** (§13, §47) — each reply carries a grounding
  badge (based on your material / material + additional explanation /
  general / not covered), quoted sources linking back to the material's
  Content tab, and a separate "additional explanation" block for general
  knowledge. When the material does not cover a question the tutor says so.
- **Quick actions and follow-ups** (§19) — explain, like I'm a beginner,
  example, analogy (kept separate from the actual definition), step by step,
  quiz me, guide me, why am I wrong, simplify, summarize, compare, mnemonic;
  under every answer: explain more, example, simplify, analogy, test me, add
  to notes (appends to a "Tutor notes" reviewer), create flashcard (saves
  into a "Tutor cards" deck).
- **Modes** — direct answers or guide me (hints, no answer); the mode is
  stored per conversation.
- **Highlight-and-ask** (§20) — selecting text in a material's Content tab
  or in a reviewer shows Explain, Simplify, Summarize, Example, Quiz me, Ask
  why, Compare, Mnemonic; the selection and its passage go to the material's
  conversation.
- **Why is my answer wrong?** — one click from any incorrect quiz question
  or notebook entry opens the tutor with the question, the student's answer
  and the correct answer.
- **Tutor-based study methods** — Socratic questioning, elaborative
  interrogation and self-explanation run as tutor conversations in a
  dedicated mode (the tutor opens with a probing question, never hands over
  the answer); ending the session produces an evaluation of the student's
  reasoning (score, strengths, missing concepts, next step) stored as the
  §29 summary.

### Phase 6 — Adaptive intelligence

- **Schema** — `concept_mastery` (`supabase/migrations/0006_mastery.sql`):
  one cached row per student and concept with mastery, retrieval strength,
  status, next difficulty, attempt/correct/incorrect counters, streak, open
  mistakes, misconceptions, underconfident answers, average confidence and
  response time, trend, last practised and next review timestamps.
- **Mastery model** (§28) — `computeMastery()` in `src/lib/adaptive/mastery.ts`
  is pure and unit-tested: recency- and difficulty-weighted accuracy scaled
  by how much evidence exists, minus penalties for unresolved mistakes and
  confident wrong answers; a forgetting-curve retrieval strength whose
  stability grows with the correct streak; the next review date; status
  thresholds (weak < 40, learning < 60, strong < 80, mastered ≥ 80, never
  locked); progressive difficulty (easy → medium → hard → advanced).
- **Evidence** — `recomputeMastery()` rebuilds rows from quiz answers,
  study session items (recall, Feynman, error review), flashcard reviews and
  the mistake notebook; every grading path calls `refreshMastery()` for the
  concepts it touched (§51 consistency: one answer updates results, concept
  performance, mastery, the notebook, confidence analysis and
  recommendations).
- **Adaptive difficulty** (§28) — quizzes default to "Adaptive": the
  generator receives per-concept targets from mastery plus the weak
  concepts to emphasise; practice-testing sessions use it too.
- **Progress page** (§23) — concepts tracked, average mastery,
  misconceptions, sessions completed; per-concept mastery table (status,
  bar, recall strength, answers with confident misses, trend, next
  difficulty, next review); confidence check (wrong but confident / right
  but unsure); "what to do next".
- **Recommendations with reasons** (§15, §22) — `getRecommendations()` ranks
  Feynman for misconceptions, active recall for weak concepts, error review
  for open mistakes, recall for fading concepts, spaced repetition for due
  cards, timed practice for underconfident concepts and an exam simulation
  when everything is strong; shown on the dashboard, the progress page and
  the material overview ("Your mastery of this material").
- **Smart Study** (spec flagship) — the builder's first method: RevTaw
  budgets the chosen minutes into blocks (error review, active recall,
  Feynman, spaced repetition, a short adaptive test) with the reason for
  each; blocks run as ordinary child sessions linked to the parent plan, the
  plan page tracks status (start/resume/skip/view summary) and the session
  ends with one combined summary.

### Phase 7 — Planner

- **Schema** — `exams` + `exam_materials`, `study_plans` (one per exam),
  `study_tasks` (plan tasks, 1-3-7-14 reviews, custom tasks), `study_goals`,
  `notifications`, `profiles.timezone` (`supabase/migrations/0007_planner.sql`).
- **Exams** (§30) — title, date, subject, priority, confidence, topics,
  notes and the materials covered; countdown and a readiness estimate
  (mastery of the exam's materials blended with plan completion) on the
  planner, the exam page and the dashboard's "Upcoming exams".
- **Generated study plans** (spec "Exam Study Plan", "Cram Mode",
  "1-3-7-14 Review") — `generatePlan()` in `src/lib/planner/generate.ts` is
  pure and unit-tested: study days from the student's available weekdays,
  slots from the daily budget, interleaved first passes weighted by each
  material's size and mastery gap (recall → test → Feynman for concept-heavy
  material), 1-3-7-14 reviews after each first pass, consolidation days with
  adaptive tests, mistake reviews and flashcard sweeps, final days with a
  mistake review and an exam simulation, and a rapid review on exam day.
  Cram Mode (chosen, or forced with fewer than three study days) packs each
  day with mistakes, weak-concept recall, definitions and practice and
  carries the "not a substitute for spaced study" note.
- **Plans adjust** (§30) — once a day per plan: missed tasks move forward
  into free days (or are marked missed when nothing fits), a material at
  85%+ mastery loses a recall task, one under 40% gains an extra one; a
  changed exam date, material set or settings regenerates the plan keeping
  finished tasks; the adjustment note is shown on the exam page and "Adjust
  now" / "Regenerate" run it on demand.
- **Due-today system** (§22) — today's plan tasks with minutes done, overdue
  tasks, due flashcards and fading concepts on the planner and the
  dashboard. "Start" opens a session of the task's method sized to its
  minutes (flashcard tasks open the review page); completing the session
  closes the task (§51/§53: the task carries the session that did it);
  Done / Skip / Reopen; custom tasks on any day.
- **Scheduled reviews** — "Schedule 1-3-7-14 reviews" on a material adds
  short recall passes on days 1, 3, 7 and 14.
- **Study goals** (§32) — study N minutes (today/this week), review N
  flashcards, answer N questions, reach N% mastery of a material, finish a
  material by a date; progress is computed from sessions, reviews, answers
  and mastery, mastery goals complete themselves, once-goals can be ticked.
- **Notifications** (§35) — internal reminder feed generated server-side
  with deduplication keys (reviews due, exams in 7/3/1/0 days, planned tasks
  today, goals reached, streak at risk in the evening) with a bell, unread
  badge, panel and "mark all read"; email/push can read the same rows later.
- **Time zone** — captured from the browser once, editable in Preferences;
  "today", due dates, streak and focus-time days follow it.

### Phase 8 (part 1) — Advanced study methods

- **Schema** — `study_session_items` gains the kinds `blurt`, `chunk` and
  `question` (`problem`, `scenario`, `case` and `stage` are reserved for
  part 2), a `format` and a `material_id` for multi-material sessions;
  `tutor_mode` gains `teach_back`; `routines` stores custom study routines
  (`supabase/migrations/0008_methods.sql`).
- **Answers stay server-side** — a session item's model answer and grading
  key points reach the browser only once the item is answered or the
  session is over.
- **Method catalogue** — every study method in the spec is on the Methods
  page with how it helps, best use cases, suggested time and availability;
  the ones still to build are labelled "Phase 8".
- **Retrieval practice** (§16) — recall prompts rotate through eight
  formats (short answer, definition, fill in the blank, explanation, list,
  example, process, calculation); each prompt shows its format and the
  answer box adapts to it.
- **Rapid review** — 5, 10 or 15 minutes: open mistakes first, then weak
  concepts and the material's likely exam topics.
- **Cumulative review** — 60% current material, 20% the previous one, 10%
  older and 10% the oldest; every prompt names its source material.
- **Interleaving** — two to four materials; prompts alternate between them
  and show where each one comes from.
- **Blurting** — each section of the material becomes a blurt: the notes
  stay hidden while the student writes, the comparison lists remembered,
  missing, incorrect and forgotten-important ideas, one retry is allowed,
  then the source is revealed; a weak blurt files a mistake.
- **Chunking** — the material split into chunks (main idea, important
  details, mini summary); a chunk's recall question unlocks the next one.
- **Question generation** — the student writes exam-style questions (and
  the answer they expect); RevTaw rates relevance, clarity, accuracy and
  difficulty, suggests an improved version and gives the model answer; the
  summary keeps the average quality.
- **Teach-back** — a tutor session in which the AI plays the learner, asks
  beginner questions whenever something is unclear and ends with a teaching
  score, strengths, missing concepts and one improvement.
- **Mixed practice** and **exam simulation** — a practice test with all nine
  question types shuffled, or exam mode (timer, shuffled questions and
  options, no hints, automatic submission, full breakdown at the end).
- **Custom routines** — save an ordered list of method blocks (minutes,
  optional material and question count) and run it as one session: blocks
  are ordinary child sessions with a "Back to routine" link and one combined
  summary; routines can be edited and deleted.
- **Smart Study** — sessions of 40+ minutes on a material open with a
  10-minute blurt; practice-test blocks settle as soon as the attempt is
  submitted.
- **Planner** — the final days' "Exam simulation" tasks start an exam
  simulation and the "Rapid review" tasks (day before and exam day) start a
  rapid review.
- Finished sessions keep their method-specific stats (blocks done, teaching
  or reasoning score, Pomodoro rounds, average question quality) after a
  reload.

### Phase 8 (part 2) — The remaining study methods

Every method of the specification now has its own session. The Methods page
no longer has a "coming later" section.

- **Schema** — `study_session_items` gains the kinds `visual`, `link`,
  `mnemonic`, `loci` and `story`; `study_maps` stores mind maps, concept maps
  and dual-coding visual sets; `mnemonics` stores saved memory devices;
  `memory_palaces` stores routes of locations; `tutor_messages.visual`
  carries a diagram drawn by "Visualize" (`supabase/migrations/0009_methods_part2.sql`).
- **Hidden until answered** — besides the model answer and key points, the
  supporting source excerpt of an item and the concept name of a
  memory-palace stop stay on the server until the item is answered.
- **Worked examples** — the problem, every step with its reason and the
  final answer, revealed step by step; then a similar problem the student
  solves alone and RevTaw checks the reasoning, not just the result.
- **Faded worked examples** — the same family of problems with 90%, 70%, 40%
  and 0% of the steps given; a struggle keeps the same amount of help for the
  next example instead of fading further.
- **Practice problems** — source-grounded problems at an adaptive or fixed
  difficulty (easy, medium, hard, challenge), each with a full solution and
  an alternative approach when one is valid; drafts survive a refresh.
- **Scenario-based learning** — a realistic situation, plausible actions and
  a justification; the choice (60%) and the reasoning (40%) are graded
  separately with the rationale for the best action.
- **Case-based learning** — a detailed case with background, data and a
  complication; the student writes the problem, the evidence, the possible
  solutions, the best one and a justification; each field is scored next to
  the expert analysis.
- **SQ3R and PQ4R** — guided reading stage by stage: survey/preview (summary
  and concepts), question (one question per section, suggestions offered),
  read (section by section, each marked read), reflect (PQ4R: conceptual
  questions answered inline), recite (answer your own questions from memory
  — the section text hidden) and review (a summary checked against the
  chapter).
- **Dual coding** — each topic as text, as a visual (table, flowchart,
  timeline, hierarchy or concept graph) and combined; visual sets are saved
  per material and reused; "rebuild" exercises hide the visual and the
  student reorders steps, fills cells, re-attaches children or names
  relations. "Visualize" in highlight-and-ask draws the same visuals in the
  tutor.
- **Mind mapping** — a generated map (centre, branches, cross-links) that
  the student edits in an outline view (add, rename, remove, fold, connect)
  and sees drawn in a map view; "Quiz me on this branch" writes recall
  questions from one branch, answered inline. The map is saved per material
  and reopened by the next session.
- **Concept mapping** — concepts linked by explicit relationships (causes,
  requires, leads to, contains, depends on, is an example of), drawn as a
  graph and edited; "Test the links" hides the relationships and the
  student names each one.
- **Mnemonics** — RevTaw finds the lists and sequences in the material and
  offers acronyms, acrostics, rhymes, memory phrases, associations and small
  stories for each, with how the device maps to every item; an accuracy
  guard drops acronyms and acrostics that do not spell the list in order;
  the student picks a device or writes their own, saves the ones that work,
  then recalls the list from the cue alone (graded per item, and for order
  when the order matters). A **Memory aids** page (`/study/memory`) lists
  saved mnemonics (add, edit, favourite, delete, practice) and a session can
  practise the saved ones instead of writing new ones.
- **Memory palace** — the student defines a route of familiar locations (or
  reuses a saved palace), RevTaw places one key concept at each stop with a
  vivid image that still states the meaning, and the walk asks what sits at
  each stop in order; the image and meaning come back after each answer.
  Earlier placements on the same palace and material are reused so a palace
  is built once and walked often; palaces are managed on the memory aids page.
- **Story method** — related facts become a short, academically accurate
  story shown beside the original notes, each paragraph marked with the facts
  it carries (side by side, notes only or story only); the student retells
  the story from memory and every fact is checked, with contradictions
  flagged.
- **Pre-test → study → post-test** — a short diagnostic test, a study block
  aimed at the concepts the diagnostic missed ("what to pay attention to")
  and a post-test on the same concepts; the plan page and the summary show
  the before-and-after score and the change per concept.
- **Analogy-based learning** lives in the tutor ("Give me an analogy"
  always separates the analogy from the actual definition).
- **Recommendations** — a weak calculation concept is sent to worked
  examples and a weak memorization concept to mnemonics, with the reason.

### Phase 9 — Analytics and gamification

- **Schema** — `xp_events` (an append-only XP ledger, one row per rewarded
  source, idempotent by `source_key`) with a trigger that keeps
  `profiles.xp` in step; `achievements` (unlocked badges);
  `notification_kind` gains `achievement` and `level_up`
  (`supabase/migrations/0010_gamification.sql`).
- **Progress analytics** (§23) — the Progress page leads with average quiz
  score, accuracy, study time and flashcards for the last 30 days, concepts
  tracked, average mastery, retrieval strength and possible misconceptions;
  charts of study minutes, questions answered (with the correct share), quiz
  scores and flashcards reviewed per day; performance by subject, by topic
  (material), by difficulty and by confidence (calibration); a mastery
  status strip. Every chart has a hover/keyboard readout and a table view.
- **Mastery map** (§24, `/progress/map`) — subject → material → concept with
  the percentage and status; every concept carries the session RevTaw
  recommends for it (misconception → Feynman, weak calculation concept →
  worked examples, weak memorization concept → mnemonics, open mistakes →
  error review, fading → active recall, unsure → practice test, mastered →
  flashcard review) one click from the builder with the material preselected.
- **XP and levels** (§31) — 1 XP per answered question plus 1 per correct
  answer (quiz attempts and session items), 10 for a finished session, 1 per
  flashcard reviewed, 25 the first time a concept reaches mastered, 15 per
  reached goal and period, 5 per active day, 20 per badge; levels cost 100
  more XP each (0, 100, 300, 600…). A level-up is announced in the reminder
  feed once.
- **Badges and milestones** — 28 plain rules over the evidence (first
  session, ten and fifty sessions, Active Recall Beginner/Regular, method
  explorer, exam rehearsal, memory architect, measured improvement, 100/500/
  1,000 questions, top marks, 100/500 cards, memory aids, 3/7/14/30-day
  streaks, first/five/twenty topics mastered, first material, ten and fifty
  hours of focus, goal getter). They unlock on dashboard and progress loads,
  earn XP and a notification once, and `/progress/achievements` lists every
  badge with its rule and progress plus the XP history.
- **Goals** — daily and weekly goals (Phase 7) now appear on the Progress
  page and earn XP when reached; the dashboard shows the level card (level,
  XP bar, streak, badge count).

## In Progress

- Nothing at the moment. Phase 10 starts next.

## Next (priority order)

1. **Phase 10 — Export and refinement**: PDF/Word/print export, global
   search, accessibility, security and performance reviews.

## Database

| Table | Purpose | Ownership |
| --- | --- | --- |
| `public.profiles` | One row per `auth.users` row: display name, education level, main goal, preferred session minutes, onboarding timestamp, time zone, `xp` (kept in step with the ledger by trigger) | RLS: owner may select/insert/update; no delete policy (cascade from `auth.users`) |
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
| `public.study_session_items` | Prompts worked through in a session (recall, feynman, mistake, blurt, chunk, question, problem, scenario, case, stage, visual, link, mnemonic, loci, story): model answer, key points, response, AI `analysis` (what the student sees while working), correctness, score, confidence, time, attempts, `format` (retrieval format, question difficulty, fade level…), `material_id` (multi-material sessions) | owner full access; cascade from session; concept/mistake/material FKs set null |
| `public.routines` | Custom study routine: title, description, ordered `blocks` JSON (method, minutes, optional material and question count), `last_used_at` | owner full access |
| `public.study_maps` | Mind maps, concept maps and dual-coding visual sets per material: kind, title, validated `data` JSON, provider/model | owner full access; material FK set null |
| `public.mnemonics` | Saved memory devices: kind (acronym, acrostic, rhyme, phrase, association, story, custom), target, ordered `items`, content, explanation, source (ai/user), favorite, `last_practiced_at` | owner full access; material/concept FKs set null |
| `public.memory_palaces` | Routes of locations for the method of loci: title, `locations` JSON (name, detail), `last_used_at` | owner full access |
| `public.flashcard_decks` | Generated deck: title, status + detail, provider/model, card count | owner full access; cascade from material |
| `public.flashcards` | Card: front/back/hint, concept, source, favorite, suspended, Leitner `box`, `ease`, `interval_days`, `repetitions`, `lapses`, `due_at`, last review/rating | owner full access; cascade from deck; partial index on due cards |
| `public.flashcard_reviews` | Review log: rating, response time, box before/after, interval, due date, optional session | owner full access; cascade from card |
| `public.tutor_conversations` | Tutor chat: material, optional study session, mode, title, message count, last message | owner full access; material/session FKs set null |
| `public.tutor_messages` | One turn: role, content, quick action, selection, grounding, `sources` JSON, additional explanation, follow-ups, flashcard draft, optional `visual`, provider/model | owner full access; cascade from conversation |
| `public.concept_mastery` | Recomputable cache per student and concept: mastery, retrieval strength, status, next difficulty, counters, streak, open mistakes, misconceptions, underconfident, average confidence/response time, trend, last practised, next review | owner full access; unique `(user_id, concept_id)`; cascade from concept |
| `public.exams` | An exam: title, date, subject, priority, confidence, topics, notes, `archived_at` | owner full access; subject FK set null |
| `public.exam_materials` | Materials an exam covers, with position | owner full access; cascade from exam and material |
| `public.study_plans` | One plan per exam: mode (exam/cram), status, start/end, `available_days`, `minutes_per_day`, `settings` (warnings), `generated_at`, `adjusted_at`, `adjustment_note` | owner full access; unique `exam_id`; cascade from exam |
| `public.study_tasks` | A scheduled activity: kind (plan/review/custom), method, title, reason, `scheduled_for`, position, minutes, concepts, status (pending/done/skipped/missed), `session_id`, `completed_at` | owner full access; cascade from plan/exam; material and session FKs set null |
| `public.study_goals` | A goal: kind, period (day/week/once), target, optional material/subject, title, `due_date`, status | owner full access; cascade from material/subject |
| `public.notifications` | Reminder feed: kind (incl. `achievement`, `level_up`), title, body, href, `dedupe_key`, `read_at` | owner full access; unique `(user_id, dedupe_key)` |
| `public.xp_events` | XP ledger: source (answers, session, reviews, mastered, goal, streak_day, achievement), `source_key` (idempotent award), points, label | owner full access; unique `(user_id, source_key)`; trigger `apply_xp_event` adds to `profiles.xp` |
| `public.achievements` | Unlocked badges: key, `unlocked_at`, `seen_at` (definitions live in `src/lib/gamification/achievements.ts`) | owner full access; unique `(user_id, key)` |
| `storage.objects` (bucket `materials`) | Private files under `<user_id>/<material_id>/<file>` | policies on first path segment = `auth.uid()` |

Enums: `education_level`, `study_goal`, `material_source`, `material_status`,
`difficulty_level`, `reviewer_kind`, `generation_status`, `question_type`,
`question_difficulty`, `quiz_mode`, `attempt_status`, `confidence_level`,
`mistake_type`, `session_status`, `session_goal`, `flashcard_rating`,
`tutor_mode` (incl. `teach_back`), `tutor_role`, `mastery_status`, `next_difficulty`,
`exam_priority`, `plan_mode`, `plan_status`, `task_kind`, `task_status`,
`goal_kind`, `goal_period`, `goal_status`, `notification_kind`. Helper functions: `public.set_updated_at()`,
`public.handle_new_user()` and `public.apply_xp_event()` (security definer, pinned `search_path`).

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
  (per-method behaviour, goals, availability, builder/recall/test/tutor
  method groups, builder recommendations), `formats.ts` (retrieval formats,
  client-safe), `sessions.ts` (create/complete/summary, improvement vs.
  previous session), `ai.ts` (recall prompts with formats, recall
  comparison, Feynman concepts and analysis, blurt comparison, chunk plans,
  question evaluation), `advanced.ts` (Phase 8 starters and item flows:
  retrieval practice, rapid/cumulative review, interleaving, blurting,
  chunking, question generation), `routines.ts` (custom routines, run
  through the Smart Study plan machinery as a `custom_routine` parent
  session), `service.ts` (method dispatch, recall/Feynman/error-review item
  flows, Pomodoro state, practice-test sync for single sessions and plan
  blocks), `queries.ts` (sessions with hidden answers, activity stats:
  streak and focus time), `actions.ts`. The part-2 methods follow one
  layout: `items.ts` (shared session/item plumbing: open a session, insert
  items, `recordItemResult` = store + counters + mistake + mastery, drafts),
  `prompts/*.ts` (server-only prompts and zod schemas per method family:
  problems, applied, reading, visual, maps, memory), `flows/*.ts` (server
  logic per family: `problems`, `applied`, `reading`, `visual`, `maps`,
  `memory`, `pretest`), client-safe constants and pure helpers
  (`problem-options.ts`, `reading-options.ts`, `visuals.ts`, `maps.ts`,
  `memory-options.ts`, `summary-stats.ts`), `method-actions.ts` (Server
  Actions) and `action-helpers.ts`. Runners live in `src/components/study/`
  (recall, Feynman, Pomodoro, blurting, chunks, question generation,
  problems, scenarios, cases, guided reading, dual coding, mind and concept
  map editors, mnemonics, memory palace, story, smart/routine/pre-test
  plan) and share `SessionHeader`, `SessionSummaryCard` and `runner-kit.tsx`
  (completion hook, summary, verdict box, inline recall card) (§52 reusable
  components); `visual-view.tsx` renders dual-coding visuals; method-specific
  stats go into `summary.extra` and `summary-stats.ts` renders them in both
  the runner and the finished page. Whatever the student may see while
  working goes in an item's `analysis`; hidden structured data (solutions,
  keys, placed concepts) goes in `model_answer` as JSON.
- **Tutor** — `src/lib/tutor/`: `types.ts` (actions, follow-ups, modes,
  grounding labels), `context.ts` (keyword-scored passage selection with a
  character budget), `ai.ts` (reply prompt with grounding rules per mode and
  action; session evaluation), `service.ts` (conversations, `respond()` =
  context + model + source validation + storage, add to notes, create
  flashcard, tutor-based sessions), `queries.ts`, `actions.ts`. The chat UI
  is `src/components/tutor/`; `HighlightToolbar` wraps any material text.
  The default mode uses the fast model tier; guided/Socratic modes use the
  strong tier. Replies are not streamed (one validated JSON object per turn).
- **Adaptive engine** — `src/lib/adaptive/`: `mastery.ts` (pure model,
  thresholds, labels), `engine.ts` (evidence collection, recompute/refresh,
  mastery views and summary, weak concepts, difficulty targets),
  `recommend.ts` (ranked recommendations with reasons), `smart.ts` (Smart
  Study planner, plan schema in `study_sessions.state`, block bookkeeping,
  combined summary). UI in `src/components/adaptive/` (mastery bar/table,
  recommendation list, material mastery) and
  `src/components/study/smart-session.tsx`. Mastery is a cache: deleting
  the rows and answering anything rebuilds them.
- **Analytics** — `src/lib/analytics/`: `queries.ts` (the 30-day daily
  series, totals, quiz scores, breakdowns by difficulty, confidence, subject
  and material, mastery distribution, retrieval strength — all from the
  evidence tables in the student's time zone) and `map.ts` (the mastery map
  grouped by subject and material, with `recommendForConcept()`). Charts
  are plain SVG/markup in `src/components/analytics/charts.tsx` (one hue
  for magnitude, status colours only for status, hover/keyboard readout,
  table view); the map UI is `mastery-map.tsx`.
- **Gamification** — `src/lib/gamification/`: `xp.ts` (pure rules and
  levels), `achievements.ts` (pure badge rules over a stats snapshot),
  `service.ts` (`awardXp()` — idempotent per source key, announces
  level-ups — and the hooks called from `completeSession()`,
  `submitAttempt()`, `recomputeMastery()` and the goal check in the
  reminder sync), `sync.ts` (`syncGamification()`: active days, badge
  unlocks, notifications; `getGamificationView()`). UI in
  `src/components/gamification/badges.tsx`. Next.js internals thrown inside
  these best-effort paths are re-thrown with `unstable_rethrow`.
- **Planner** — `src/lib/planner/`: `dates.ts` (time-zone aware calendar
  helpers), `generate.ts` (pure plan generator, readiness score),
  `types.ts` (labels, zod schemas shared with the client), `service.ts`
  (exams, plan generation/regeneration, daily `rebalancePlan`, tasks,
  review cycle, `plannerClock`), `goals.ts` (goal progress from evidence
  tables), `queries.ts` (exam summaries with readiness, due today, tasks),
  `actions.ts`. `src/lib/notifications/` generates and lists the reminder
  feed. UI in `src/components/planner/` and `src/components/app/
  notifications-menu.tsx`. Sessions started from a task carry
  `state.taskId`; `completeSession()` closes the task. Next.js dedupes
  identical GET requests inside one render, so pages run the daily
  adjustment before reading the data they display.

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
- Mastery is recomputed from evidence on every graded answer (one query
  per evidence table scoped to the touched concepts); very large histories
  would benefit from incremental updates. Rows for answers given before
  Phase 6 appear the next time one of their concepts is practised.
- Session items and flashcard generation also run inside a single request
  (`maxDuration = 120` for routes; Server Actions for sessions). Very long
  materials rely on the transcript budget.
- The daily plan adjustment runs when the dashboard, planner or exam page
  loads (no background scheduler yet); reminders are generated the same
  way, so a student who does not open the app gets them on the next visit.
  Email/push delivery reads the same `notifications` rows later.
- Plan generation is rule-based and deterministic (no model call); it uses
  each material's analysis, mastery, open mistakes and decks.
- Smart Study plans are rule-based (budget split by what the data shows);
  exam pacing is the planner's job and fixed habits are custom routines.
- Blurting sections follow the material's headings (inline headings split
  long chunks); notes without headings become a few long sections.
- Question generation evaluates one question per model call; interleaving
  mixes up to four materials; rapid review is 5, 10 or 15 minutes by
  design.
- Custom planner tasks offer the Phase 4 methods only; plan-generated tasks
  already use exam simulation and rapid review.
- Tutor replies arrive as one message (no token streaming); the context is
  chosen by keyword overlap rather than embeddings, which is accurate for
  materials up to a few hundred pages and cheap to run.
- Problems, scenarios, cases, stories and mnemonics are generated once per
  session from the material's transcript; AI-graded answers (working,
  justifications, case fields, retellings) use the fast tier. A device that
  the accuracy guard rejects (an acronym that does not spell the list) is
  dropped rather than regenerated.
- Visual sets and maps are reused per material; the builder offers to draw
  new ones. The map editors are keyboard and screen-reader friendly outline
  editors with a read-only drawn view; drag-and-drop editing on the canvas
  is a later refinement.
- A memory palace places one concept per location from the material's
  analysis (defined terms first, then key concepts); materials with fewer
  than three key concepts cannot start one. Walk stops check the concept's
  name leniently (not its meaning).
- Pre-testing's post-test asks the generator to stay on the pre-test's
  concepts; the questions themselves are new, so the per-concept table can
  include a concept only one of the tests reached.
- Analytics read up to the most recent 3,000 answers per table and 200
  attempts; the daily charts cover 30 days. Statistics are computed on
  each load (no materialised rollups), which is fine for a student's own
  history.
- XP is append-only (nothing subtracts); deleting a quiz or session keeps
  the points it earned. Badges unlock when the dashboard, progress or
  achievements page loads, not the instant the rule is met.

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
- Tutor: anonymous API rejected; grounded answer with sources; follow-ups
  (simplify, create flashcard → tutor deck, add to notes → tutor notes
  reviewer); "not covered by your material" answer; guide-me mode; highlight
  and ask from the Content tab reusing the material's conversation with the
  selection stored; Socratic session (opener question, questions in reply,
  evaluation summary, read-only afterwards); rename, delete keeps saved
  cards; mobile layout
- Adaptive: progress empty state; adaptive quiz badge and default; a quiz
  with confident and unsure misses produces one mastery row per concept
  (misconception, underconfident, open mistake, next review, retrieval
  strength, attempts add up); progress page stats, table, confidence check
  and top recommendation; dashboard recommendations with the Smart Study
  CTA and mastery bars; material mastery card; Smart Study plan of four
  blocks using the whole budget, child sessions carrying the parent id,
  error review block resolving mistakes and feeding mastery, recall block,
  skip, combined summary (persisted after reload), a second plan that picks
  the material itself and drops error review; the next quiz follows each
  concept's next difficulty; anonymous progress page redirects
- Planner: browser time zone stored; empty states; exam dialog creates a
  plan (countdown, priority, confidence, topics; tasks between today and
  the exam within the daily budget, 1-3-7-14 reviews, exam simulation,
  rapid review on exam day; settings persisted); starting a task links its
  session and completing the session closes the task; Done / Skip and plan
  progress; goals computed from answers and mastery; dashboard due today
  and exam countdown; notifications generated, unread badge, panel, mark
  all read; 1-3-7-14 cycle from the material page; a missed task is moved
  forward with an adjustment note; custom task add/delete; moving the date
  close regenerates in cram mode keeping finished tasks; mobile layouts;
  delete cascades plan tasks but keeps the review cycle; anonymous
  redirect
- Advanced methods (Phase 8 part 2): worked examples (step-by-step reveal,
  similar problem checked, solution hidden until answered), faded examples
  (90/70/40/independent, help held after a struggle, draft survives a
  refresh, mistake filed), practice problems at a fixed difficulty with an
  alternative approach; scenarios (choice and justification graded, drafts,
  mistake), cases (five fields scored beside the expert analysis); SQ3R and
  PQ4R stage by stage (suggested questions, sections marked read, reflect
  questions, recite with the text hidden, review summary); dual coding
  (three views, visuals of several types, rebuild exercises graded, visual
  set reused); "Visualize" in highlight-and-ask; mind maps (fold, add,
  rename, connect, remove, map view, branch quiz, edited map reopened);
  concept maps (add concept and typed relationship, link test with a wrong
  link filed); mnemonics (accurate devices, save, own device, practice with
  the list hidden, order check, saved-mnemonic session, memory aids page
  add/favourite/edit/delete); memory palace (route editor with validation,
  quick add, reorder, placements, walk with concepts hidden, forgotten stop
  filed, saved palace reused with the same placements, palace library);
  story method (notes and story side by side with fact markers, view toggle,
  retelling checked fact by fact, draft survives a refresh); pre-testing
  (plan in order, diagnostic, "what to pay attention to", aimed study
  block, post-test on the same concepts, before-and-after table and
  improvement in the summary after a reload); mobile layouts
- Advanced methods (Phase 8 part 1): Methods page availability; retrieval
  practice with eight labelled formats and answers/key points hidden until
  answered; rapid review presets with mistakes first; cumulative review with
  source labels; interleaving alternating between materials; blurting (two
  rounds, source hidden until the last one, weak blurt filed as a mistake);
  chunking (read → recall → next, chunk text kept with the answer); question
  generation (ratings, the on-topic question scores higher, average quality
  survives a reload); teach-back (learner opener and questions, teaching
  score); mixed practice with all nine question types; exam simulation in
  exam mode; routines (create, start, run a block, back to routine, finish,
  edit, delete); Smart Study opening blurt; planner exam-simulation and
  exam-day rapid-review tasks start their own methods; mobile layouts
- Analytics and gamification: level card and badge grid empty states; a
  submitted attempt and a finished session earn the right XP and the
  profile total follows the ledger; active day and first badges awarded on
  a dashboard load, badge and level-up notifications, nothing awarded
  twice on a second load; achievements page lists unlocked badges and the
  XP history; progress stats (average quiz score by points, accuracy over
  quiz answers and session items), charts with table views (30 daily
  rows), mastery overview, level and goals cards; a reached daily goal
  earns 15 XP once; the mastery map groups concepts by material and
  subject and its recommended session opens the builder with the method
  and material preselected; mobile layouts
- Unit tests (`npm test`): JSON extraction, chunking, content helpers,
  analysis transcript, markdown renderer, quiz distribution/grading/config,
  the mock quiz generator, the flashcard scheduler, the tutor context
  selector, the mastery model, the planner date helpers, the plan
  generator and the mock study-method heuristics (retrieval formats, blurt
  scoring, chunking, question rating, problems, scenarios, cases, reading,
  mnemonics, palace images, stories); the fade schedule, reading stages,
  visual grading (order, cells, hierarchy, relations), map structure rules
  and layout, list-recall grading, mnemonic accuracy checks, palace and
  story helpers, summary stats, the pre-test plan layout, XP rules and
  levels, badge rules and the longest-streak helper

Commands: `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest unit tests),
`npm run build`.

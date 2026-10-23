# RevTaw — Project Status

Living record of what exists, what is being built and what comes next. Read
this first in every development session, then `package.json`,
`supabase/migrations/`, `src/lib/routes.ts` and the relevant components.

_Last updated: 2026-10-23 (the Archive, Tamari's language any time and the level card, after the learning engine round, the API integrations round, the UI/UX phase and Phases 1–10)_

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

### Phase 10 — Export, search and refinement

- **Export** (§34) — reviewers, quizzes (optionally with the answer key),
  attempt results, flashcard decks, exam plans, the mistake notebook (open
  or learned) and the progress report (30 days) export as **PDF**, **Word**
  (`.docx`) or a **printable page**. One document model
  (`src/lib/export/model.ts`: headings, paragraphs with inline runs, lists,
  tables, key-value grids, callouts, code, page breaks; markdown converted
  with the app's own parser) feeds three renderers: `html.ts` (standalone
  printable page, everything escaped, a nonce'd print button that also
  auto-prints with `?print=1`), `docx.ts` (`docx` package: real headings,
  numbered and bulleted lists, tables, footer with page numbers) and
  `pdf.tsx` (`@react-pdf/renderer`, A4, standard Helvetica fonts, page
  numbers). `GET /api/export/<kind>?id=…&format=pdf|docx|html` builds the
  document through the signed-in client (RLS decides what can be exported),
  is rate-limited (30 a minute per user) and answers with `no-store`,
  `nosniff` and a dated attachment filename. `ExportMenu` (print / PDF /
  Word) sits on notes, quizzes, results, decks, exam plans, the notebook and
  the progress page.
- **Global search** (§33, `/search`) — one query across documents (titles
  and extracted text), notes and reviewers (titles and sections), topics
  (concepts with their mastery), quiz questions, flashcards and AI
  conversations (titles and messages), grouped with snippets around the
  first match and the place the hit comes from. PostgreSQL full-text search
  with English stemming and websearch syntax (quotes, OR, minus), backed by
  GIN indexes and generated `search_text` columns
  (`supabase/migrations/0011_search.sql`); the signed-in client runs the
  queries so RLS scopes them. The sidebar box submits from anywhere and
  `/` focuses it; the mobile header links to the page.
- **Accessibility review** — axe-core (WCAG 2.1 A/AA + best practices) over
  35 signed-out and signed-in states, in light and dark mode, now reports no
  violations. Fixed along the way: card titles are `h2` under the page `h1`
  (`CardTitle as=…` for deeper levels); progress bars carry their own
  accessible name and value text; charts are groups of focusable, labelled
  bars (no interactive content inside an image role); the logo and the
  flashcard flip button are named by their visible text; quiz, study, tutor
  and flashcard-review pages have a level-one heading; the sidebar and the
  quiz navigator are uniquely labelled landmarks; the sidebar and search-page
  boxes have distinct ids and names; the light danger colour is red-700
  (5.9:1 on its tint) and the "Recommended" chip uses the solid tint; the
  export menu is a disclosure (Tab through the links, Escape returns focus).
  Already in place from earlier phases: skip link, `:focus-visible` ring,
  `prefers-reduced-motion`, native `<dialog>` focus trapping, labelled
  form fields with `aria-describedby` errors, live regions for status.
- **Hydration review** — countdowns (quiz timer, Pomodoro) read the clock
  through `useNow()` (`src/lib/hooks/use-now.ts`, a `useSyncExternalStore`
  with a `null` server snapshot), so the server and client markup match and
  the first client render fills the time in; "3 min ago" labels in client
  components are marked `suppressHydrationWarning`; number and date
  formatting pins the `en-US` locale so a browser locale with other
  separators no longer breaks hydration.
- **Security review** — headers re-checked (nonce CSP with
  `strict-dynamic`, `frame-ancestors 'none'`, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in
  production, no `X-Powered-By`); every API route checks the user and is
  rate-limited per user (the material file and status routes were the two
  without a limit); exports and files are served `no-store`/`nosniff`; the
  printable page is fully escaped and its only script carries the request
  nonce; search terms go through PostgREST's `websearch` parser, never into
  SQL; secret scan of the history clean. `npm audit`: vitest upgraded to 5
  (clears the `@vitest/mocker` and `tinypool` advisories); the two remaining
  advisories have no fixed release and are not reachable at runtime —
  `braces` (lint-time, via `eslint-config-next`) and `sprintf-js` (only via
  the `argparse` CLI of `mammoth`, which the app never runs).
- **Performance pass** — the dashboard, progress and planner pages run the
  XP/badge and notification syncs alongside their own reads instead of
  before and after them (only the level card waits for the syncs); the
  search indexes above; measured on the local stack every signed-in page
  answers in about 50–140 ms time to first byte with the test data set
  (the dashboard ~110 ms after this change). Shared client JavaScript is ~430 KB
  (React, Next runtime, app shell); the PDF.js viewer (~420 KB) loads only
  on the material page.
- **Landing LCP** — the hero's words are visible from the first paint: the
  hero column rises in without fading (`animate-rise`), because Chrome does
  not count text at opacity 0 and the line under the headline (the largest
  element) was only recorded after hydration. Lighthouse mobile on the
  production build: LCP 3.4 s → 2.0–2.4 s, performance 89 → 97–99. Keep
  above-the-fold text out of opacity-0 entrances; measure with
  `npm run build && npm start` (the dev server's numbers swing widely).

### UI/UX Improvement and Personalization Phase

Made RevTaw feel modern, youthful and student-made without rebuilding it:
less crowded screens, personal settings that follow the student across
devices, one assistant everywhere, voice, and a planner calendar with
reminders. Everything earlier still works; the suites below were updated
only where a control changed (chips and segments instead of buttons, the
assistant instead of a page change).

- **Design system** (priority 1) — Bricolage Grotesque for titles, Inter
  for text; ink-violet neutrals; the theme color as `--primary` tokens;
  fixed status colors (success, warning, danger, info) that never change
  with the theme; motion tokens. Theme presets RevTaw Purple, Blue, Green,
  Orange, Pink, Red and Teal plus a custom color, generated in OKLCH
  (`src/lib/theme/color.ts`) so each passes 4.5:1 as a fill and as text in
  light and dark mode. New primitives: `ChipGroup` (single/multi select
  with visible checks, `size="sm"`), `Segmented`, `Switch`, `Disclosure`,
  `Sheet`, `Kbd`.
- **Landing page** (priority 2) — typed hero line ("Reviewer na may
  Bitaw." ⇄ "A reviewer that delivers.") without layout shift, an
  interactive study desk, "How it works" as accessible tabs, a method
  picker; mastery is drawn as pencil-shaded answer-sheet ovals
  (`components/marketing/answer-sheet.tsx`) instead of progress bars; the
  hero credits the creator, Mark Francis Entredicho, and the page closes
  with "Ano G ayaw mag-aral? Aray mo."; CSS motion only, reduced-motion
  aware.
- **Logo** — the navy RevTaw app icon is the logo next to the wordmark
  (`components/brand/revtaw-logo.png`, 96 px for 32 px) and the browser and
  home-screen icon (`src/app/favicon.ico`, `icon.png`, `apple-icon.png`).
- **Preferences** — `profiles.preferences` (sections appearance, dashboard,
  tools, ai, study, notifications, assistant; migration 0012) saved one
  section at a time by `set_preference_section()`; strict zod schemas for
  saving, lenient readers for reading. The theme color is mirrored in a
  validated cookie so the first response is already in the student's color.
- **Dashboard** (priority 3) — Continue studying, one RevTaw
  recommendation (Review now / Practice questions) and Due today first; a
  compact strip for exam countdown, streak and level, focus time and
  mastery; optional lists. Show, hide, reorder and reset from Customize or
  Settings → Dashboard (saved to the account).
- **Navigation** (priority 4) — Home plus Main (Study, Materials, Planner),
  Create (Quiz, Flashcards, Reviewer, Notes) and Learn (Study Methods,
  Progress), More Tools for the rest; tools can be pinned in Settings →
  RevTaw tools. Ctrl/Cmd+K (or `/`) command menu: any tool, quick actions,
  theme, and type-ahead search over materials, topics, notes, planner
  items, quizzes, decks and conversations (`/api/search/quick`).
- **Settings** (priority 5) — grouped into Account and Preferences:
  Appearance (mode per device, theme color, custom color, reduce motion),
  Dashboard, RevTaw tools, Tamari & AI (Tamari's switches, response
  language Auto / English / Filipino / Taglish / other, style, depth),
  Study (preferred methods), Notifications (in-app,
  email, browser; default reminder; mutable kinds). Onboarding asks for the
  response language.
- **Selection controls** (priority 6) — the quiz generator shows material,
  count, types and difficulty first and folds timer, randomization,
  confidence, feedback and focus into Advanced options; question types are
  multi-select and a mixed quiz keeps every selected type
  (`typeCoverageError`); the session builder, exam and deck dialogs use
  chips and segments.
- **The assistant** (priority 7; first "Ask RevTaw", now Tamari) — a
  floating assistant on every signed-in page (`AssistantProvider` in the
  app layout, panel loaded on first open):
  desktop panel / phone bottom sheet, page context ("Subject → Material")
  sent as ids and resolved on the server with the student's session,
  quick actions, history, new chat, expand, minimize, attach material,
  context-aware suggestions ("Why did I get number 7 wrong?"); highlight-
  and-ask and "Ask Tamari why" answer in place. Hidden during a quiz and on
  the AI Tutor pages; desktop-only where phones have bottom actions.
- **Voice** (priority 8) — mic in the composer where the browser supports
  speech recognition; avatar states idle / listening / thinking / speaking;
  commands and questions in English, Filipino and Taglish
  (`src/lib/voice/intents.ts`); confirmations before saving anything;
  answers read aloud (can be turned off); speech-to-text and text-to-speech
  are interfaces with Web Speech as the default (`src/lib/voice/`).
- **Planner calendar and reminders** (priority 9) — a month calendar
  (`role=grid`, keyboard navigation) where clicking an empty day adds an
  activity (title, category, date, time, duration, method, material,
  subject, priority, notes, reminder); category filters; edit/delete in
  place. Reminders at the time, 10 m, 30 m, 1 h, 1 d before or custom,
  delivered to the bell and as browser notifications while RevTaw is open,
  on the next visit otherwise, and by email through the scheduler
  (`/api/cron/reminders`, `CRON_SECRET`), now through Resend only (SMTP
  was removed in the API integrations round). Migrations 0014
  (activities) and 0015 (reminders).
- **Fixes found on the way** — composite foreign keys from 0007 nulled
  `user_id` on delete, so a material with scheduled reviews or a subject
  used by an exam could not be deleted (migration 0013); a selected chip's
  hint fell below 4.5:1 with some custom colors; the user bubble's action
  label in the tutor was below 4.5:1.

### Tamari, the study companion (visual AI companion integration)

Tamari — the provided pixel-art bull in a hoodie — is the face and voice of
RevTaw's one assistant (the same chat, AI, voice, page context, study data,
Smart Study engine, planner, materials, quizzes, mastery and mistake
notebook; not a second AI). Its picture lives on Home only, in the layout
instead of a circle; every other page has a round chat button.

- **On Home** — the whole character leads the "Continue studying" card:
  Tamari, then what to continue, then the buttons (on phones Tamari sits
  beside the heading, the details run across the card and the two buttons
  share a row; `TamariHome`,
  `src/components/tamari/tamari-home.tsx`; already there while the card
  loads, and at the start of the greeting when that card is hidden). Tamari
  says nothing until it is clicked; a small pixel "!" by its head means a
  line is waiting (gone once read, and read to screen readers as the
  button's description). The click opens a compact pixel speech bubble
  beside Tamari, in place of the card's words, with one line from the
  student's data, most urgent first (`homeLine()` in
  `src/lib/tamari/hints.ts`, lines in
  `src/lib/tamari/coach.ts`): an exam today or tomorrow, a streak that ends
  tonight ("5-day streak. Sayang pag pinutol mo ngayon."), a concept missed
  three times or more ("Tatlong beses na nating namiss ang Binary Trees.
  Tara, explain mo sakin."), an exam within three days ("3 days na lang bago
  Calculus exam mo."), today's reviews ("May 3 reviews ka today. Unahin
  natin Binary Trees?"), cards due ("May 6 cards kang due today."), a plan
  finished today, a real improvement ("Bitaw! From 68% to 84%.") or the
  weakest topic ("Recursion pa rin pinakamahinang topic mo."). Its button
  starts the work (the planner task, a Feynman or recall session on that
  concept, a plan); "Later" puts the line off for the day (a small
  cookie). With nothing pressing Tamari offers: "May 20 minutes ka? Ako na
  bahala." with 10 / 20 / 30 minutes. The bubble also opens the chat;
  Escape, a click outside or Tamari again closes it. With study suggestions
  off, a click on Tamari opens the chat. Customize sits in the corner.
- **Other pages** — no Tamari: a round chat button with a chat icon in the
  bottom-right corner, above the tab bar on phones and fully on screen
  (`ChatLauncher`, `src/components/assistant/chat-launcher.tsx`). It opens
  the chat, steps aside while the chat is open, and is hidden during a quiz,
  on the AI Tutor and on phones where the page has bottom actions. Home,
  where Tamari opens the chat, hides it from the first paint
  (`[data-tamari-seat]`); with Tamari turned off, Home gets it too. Plans
  keep Tamari's words without the picture (`TamariSays`), and no line pops
  up on its own anywhere.
- **The chat** — simply "Ask Tamari", with what Tamari is doing in words in
  Tamari's language ("Nakikinig ako…", "Iniisip ko…"); no mascot inside the
  panel and no avatar on messages. The microphone and spoken answers are
  reported to the provider, so Home's Tamari listens and talks.
- **States** (`src/lib/tamari/states.ts`) — idle (1–2 px breath and a blink:
  a closed-eye frame of the reading pose, only the eye pixels differ),
  learning (laptop, typing: a PDF, notes, a reviewer, a quiz or a plan
  being prepared), thinking (an answer being written), listening (pixel
  sound bars by the ear), speaking, serious (steam; repeated mistakes),
  exam (the serious face held still), confident (one bounce) and sleepy
  (five quiet minutes on Home; on return a "!" and "Uy, buhay ka pa pala.
  Review?"). Every motion is stepped (transforms, opacity, frame switches)
  and holds still with pixel animations off or reduced motion.
- **Tamari's N-Minute Bitaw** — Smart Study is now Tamari's Study Plan
  (`planTamariBlocks()` in `src/lib/tamari/plan.ts`, data in
  `src/lib/adaptive/smart.ts`): minutes become blocks from the student's
  data — active recall on fading concepts, a quiz on the weakest topics,
  one concept to explain back (the most-missed or a confident-but-wrong
  one), the mistake notebook and a last retest that stays on what the
  earlier blocks missed. 20 minutes is Active Recall 3, Weak Topic Quiz 7,
  Feynman 5, Mistake Review 3 and Retest 2 (the plan names each block; it
  runs as its method's own session and links back to the plan); short plans
  keep three blocks, long ones open with a blurt and add due cards; the
  minutes always add up. The nearest exam's material comes first ("Ako na bahala.
  20 minutes, 5 blocks — para sa Calculus exam mo in 3 days."). The plan
  opens with Tamari's line and reacts when it is done ("Bitaw. 9/10. Mas
  okay na." when the retest beat the first quiz).
- **Natural commands** (`src/lib/tamari/commands.ts`), typed or spoken,
  English / Filipino / Taglish: "20 minutes lang ako. Bahala ka na." or "I
  have an hour" plans that time; "Quiz me about Chapter 4" / "Quiz mo 'ko
  dito" writes a quiz on the material in view (Tamari works on it, says it
  is ready, then the chat steps out of the quiz's way); "May exam ako
  Friday, gawan mo 'ko review" opens the exam form on that Friday with the
  material in view; "Move this to Friday" moves the planner task last
  touched, after a yes (`moveTaskAction`). Only clear requests become
  commands. The AI reads casual requests ("Explain mo simple", "Pahirapan
  mo naman", "Easy lang muna", "Di ko gets bakit mali 'to") and keeps the
  Filipino voice subtle (no "bro/lods/pare"; "Bitaw.", "Isa pa.", "Ayun."
  sparingly).
- **Settings → Tamari & AI** — Show Tamari (Home only; off: Home gets the
  chat button too), Show the chat button, Pixel animations, Study
  suggestions, Contextual reactions, Voice commands, Sound responses and the
  Response language;
  "How Tamari explains" (style, depth) is its own card. Each saves only its
  own fields; none is mandatory.

### API integrations round (AI providers, search, voice, email, calendar, analytics)

Every service is an official API on its free tier (or a paid key the owner
adds), called only from the server; keys live in environment variables and
never reach the browser. The choices come from the research doc "RevTaw
Learning Intelligence Stack"; the learning engine it also proposes (FSRS,
BKT, Elo, Smart Study ranking) is the next round.

- **AI router** (`src/lib/ai/router.ts`, `providers/openai-compatible.ts`,
  `index.ts`) — every AI call tries the configured providers in order: Groq
  (`openai/gpt-oss-20b` fast, `openai/gpt-oss-120b` strong), Cloudflare
  Workers AI (`@cf/openai/gpt-oss-20b` / `120b` through its Responses API;
  images with `@cf/mistralai/mistral-small-3.1-24b-instruct`), Anthropic and
  OpenAI when a paid key is set, then Ollama (`qwen3.5:4b` / `9b`). Gemini
  is never picked automatically (its terms bar apps likely used by people
  under 18). A provider is skipped when a request is too big for it (Groq
  7,500 tokens by default, inside the free plan's 8,000 a minute;
  Cloudflare 110,000; Ollama its context size), when it cannot read images,
  and for a while after a failure: Groq's `retry-after` on a 429 (15 s to
  1 h, 5 min without one), 5 minutes after an outage, 30 minutes after a
  bad key. One request has 110 s across providers. The last 40 routes and
  the cooldowns show in the service check.
- **Daily AI allowance** (`src/lib/ai/quota.ts`, migrations 0016 and 0021)
  — each AI call by a signed-in student takes one request from today's
  allowance (Philippine day) for its kind: chat 60, generate 10, study 60,
  upload 30, voice 60 by default (`AI_DAILY_LIMITS`). Repairing a malformed
  answer is free, a request every provider failed is given back (one the
  student cancelled is not), and the server adds each call's tokens
  afterwards with its secret key. Voice also stops at 30 minutes of voice
  typing and 20,000 characters read aloud a day. The message says when the
  allowance refills.
- **Tamari within Groq's free budget** — a reply carries at most 9,000
  characters of material passages, the last four turns (1,500 characters
  each), a 4,000-character page note and a 1,500-token answer, so a normal
  turn stays on Groq.
- **Hybrid search for Tamari** (`src/lib/search/hybrid.ts`,
  `src/lib/ai/embeddings.ts`, migration 0017) — chunks get BGE-M3
  embeddings (`@cf/baai/bge-m3`, 1,024 dimensions stored as `halfvec`)
  when a material is processed (copied on a duplicate upload;
  `/api/cron/embeddings` fills in older materials, 20 chunks a request).
  `match_material_chunks()` fuses a `simple` full-text match (Filipino and
  Taglish words as written), trigram similarity for short questions (typos,
  affixes) and vector similarity with reciprocal rank fusion; it runs as
  the student, so RLS applies. Chunks without embeddings still match by
  words, and without the function the Phase 5 keyword selector takes over.
- **Voice fallbacks** (`src/lib/voice/server.ts`, `recorder.ts`,
  `server-tts.ts`, `/api/voice/transcribe`, `/api/voice/speak`) — browsers
  without speech recognition (Firefox, iPhone home-screen apps) record a
  clip (48 kbps, at most 30 s, stopped after a pause) that the server sends
  to Groq's Whisper (`whisper-large-v3-turbo`), then Cloudflare's; devices
  without a Filipino voice hear Azure AI Speech's `fil-PH-BlessicaNeural`.
  Audio is never stored, the clip's type is checked by its bytes, and the
  iPhone's audio is unlocked on the first tap.
- **Email** (`src/lib/notifications/`) — Resend only (SMTP removed: it
  invited personal Gmail app passwords). Every email carries an idempotency
  key, so a retry never sends twice, and one-click unsubscribe headers (RFC
  8058) with a signed link (`/api/email/unsubscribe`). The **daily study
  digest** (Settings → Notifications, off by default) goes out once between
  6 and 11 a.m. the student's time — cards due, today's plan, exams coming
  up — and not on an empty day (migration 0018 claims each day).
- **Google Calendar** (`src/lib/calendar/`, `/api/calendar/google/*`,
  migration 0019) — Settings → Notifications → Connect Google Calendar
  opens Google's own consent page (OAuth with PKCE, scope
  `calendar.app.created`, so RevTaw sees only the "RevTaw Study" calendar it
  creates). The refresh token is stored encrypted (AES-256-GCM,
  `CALENDAR_TOKEN_KEY`, bound to the student). Planner activities (their
  reminder becomes a phone notification) and exams are written with fixed
  event ids; a sync reconciles two weeks back to four months ahead,
  rewrites only what changed and removes what was deleted. Changes sync
  right after the response and `/api/cron/calendar` catches up hourly. Sync
  now and Disconnect (which revokes the token at Google) are in settings.
- **Usage analytics** (`src/lib/analytics/server.ts`, migration 0020) —
  Settings → Account → Usage analytics, off by default. Events go from the
  server to PostHog Cloud EU: a fixed list of feature events with counts
  and labels only (never content), a keyed pseudonym instead of the account
  id, no person profiles, no GeoIP, nothing in the browser.
- **Scheduler** — `/api/cron/reminders`, `/digest`, `/embeddings` and
  `/calendar` take `Authorization: Bearer <CRON_SECRET>` (timing-safe);
  `supabase/schedules.sql` runs them with pg_cron + pg_net, with the address
  and secret in Supabase Vault.
- **Service check** (`/api/system/services`,
  `src/lib/server/service-check.ts`) — for the owner (signed in during
  development, or with the cron secret anywhere): which AI providers,
  embeddings, voice, email, calendar, analytics and scheduler pieces are
  set up, the daily limits, recent routes and cooldowns; `?live=1` makes a
  tiny real call to each AI model, embeddings, Whisper and Azure. Never
  shows keys.
- **Security review** (an independent pass over the round), fixed: token
  counts are written only by the server (students could inflate their own
  rows); voice is bounded by seconds and characters, clips by 1 MB, and a
  cancelled request is no longer refunded; API base URLs must use https
  (the Google test override only localhost); emails and calendar events
  carry no localhost links in production (`getPublicSiteUrl()`); the
  hourly calendar job retries failed syncs, an unreadable token asks for a
  reconnect and cached access tokens follow their grant; analytics
  pseudonyms are keyed with a server-only secret instead of PostHog's
  public project key.
- **Decisions** — provider cooldowns live in memory per server instance
  (the per-student limits are in Postgres); `consume_ai_request()` is
  callable by students because it only counts up their own row; Google
  refresh tokens are encrypted by the app (AES-GCM) rather than Supabase
  Vault, so requests need no Vault access; the migrations are 0016–0021
  (the research doc numbered them differently); the adapter supports a
  strict JSON-schema mode that is not used yet; Cloudflare's gpt-oss and
  vision formats, Azure TTS and Google Calendar were verified against
  faithful stand-ins, not real keys (check with the service check).

### Learning engine round (FSRS, BKT, Elo, priority and method rules)

The learning engine from the research doc "RevTaw Learning Intelligence
Stack" (§5–§11). The models are pure functions in `src/lib/engine/`, tested
against the doc's worked examples; every number lives in
`src/lib/engine/config.ts` (the doc's values, heuristics to tune on real
answers). `concept_mastery` stays a cache recomputed from the evidence
tables.

- **Reading an answer** (`answers.ts`) — correctness, confidence and time
  together: a misconception (wrong while sure), a gap, a rapid guess (under
  30% of the student's median time for that question type, once there are
  five timed answers; counts a quarter), a fragile success (right but
  unsure; half) or knowledge. Self-rated flashcards count half.
- **Mastery = BKT × FSRS** (`bkt.ts`, `fsrs.ts`, `mastery-model.ts`) —
  P(learned) from Bayesian Knowledge Tracing (prior 0.20, learn 0.15, guess
  1/k for k-option multiple choice, 0.5 true/false, 0.05 typed; slip
  0.05/0.10/0.20 by difficulty) times today's recall from FSRS-6 run on the
  concept once a day (Again if any first try that day was wrong, Hard if
  one was unsure, else Good). Gates hold it back until the evidence is
  there: under 3 answers ≤ 59, an open confident mistake ≤ 79, no correct
  answer on an item Elo gave ≤ 70% ≤ 79, no correct answer on another day
  ≤ 89. Six states: Needs foundation (< 40 after 3 answers), Learning
  (< 60), Developing (60–79, new), Strong (80–89), Mastered (≥ 90). The
  mastery table shows the gate holding a concept back, and a concept that
  faded from strong or mastered as a refresh (`best_status`).
- **Weakness** (`weakness.ts`) — W = n/(n+3)·[0.6(1 − P(learned)) +
  0.25·share of confident misses + 0.15·repeated misses], flagged from
  0.30: the dashboard's weak topics, Tamari's hint and the focus of
  generated quizzes.
- **Elo difficulty** (`elo.ts`) — a rating per student and concept (K
  shrinks with answers, never under 0.2; the guessing floor is kept),
  starting at the student's ability the first time the concept is answered
  (`elo_start`, so replaying the history never drifts). Question difficulty
  is pooled in buckets (difficulty label × question type × concept
  category, `item_buckets`) refit every night from first attempts across
  students, the label counting as ten answers. The next difficulty is the
  label predicted closest to 72% success (85% while rebuilding a
  foundation, 62% to stretch a strong concept; "advanced" beyond hard);
  concepts without a target get the student's overall pick.
- **Flashcards on FSRS** (`src/lib/flashcards/scheduler.ts`) — each card
  keeps its stability and difficulty (desired retention 0.90, fuzz off);
  new cards take learning steps of 1–10 minutes, repeated later in the same
  review; the buttons show when each rating brings the card back; boxes
  are a view of stability (1 under a day … 5 beyond three weeks); reviews
  log stability, difficulty and the recall just before; cards scheduled
  under SM-2 are rebuilt from their review history on first use.
- **Priority and method rules** (`priority.ts`, `method-rules.ts`,
  `src/lib/adaptive/focus.ts`) — every concept is ranked by relevance (0.6
  outside the next exam's materials) × urgency (1 + 2e^(−days/7)) × need
  (0.45 weakness + 0.30 fading + 0.25 never studied) × freshness (halved
  after six answers today). Tamari's plan keeps its blocks and quizzes the
  top concepts (2 in 10 minutes, 3 in 20, 4 beyond); when concepts never
  studied rank first, the rule table's method (Chunking, say) takes the
  quiz's place with Tamari's reason. Recommendations and the mastery map
  use the same ranking and the rule table (state × content category, with
  overrides for a confident mistake, a close exam, short sessions and
  ordered lists); a confident mistake is still fixed first.
- **Night run** (`src/lib/adaptive/nightly.ts`, `/api/cron/engine`,
  `supabase/schedules.sql` at 2:47 and 4:47 a.m. Manila time) — refits the
  buckets, adds an **exam booster** (one review task two days before the
  exam, and the exam materials' fading flashcards due by then) for
  concepts whose recall would be under 90% on exam morning (Cepeda et al.
  2008), and recomputes stale mastery with the secret-key client (every
  query filtered by the student). Mastery older than 20 hours, or written
  by the old model, is also recomputed when the student next reads it, so
  recall fades without the scheduler too.
- **Migration 0022** — `mastery_status` gains `developing`;
  `concept_mastery` keeps P(learned), recall, the Elo rating, its answers
  and starting point, weakness, first attempts, gates, next step, best
  status and the concept's FSRS state; `flashcards` and
  `flashcard_reviews` get FSRS columns; `item_buckets` is readable by
  students and written only by the server.
- **Library** — ts-fsrs 5.4.2 (MIT, open-spaced-repetition). BKT, Elo, the
  bucket fit (Newton steps on the Rasch likelihood with a normal prior),
  weakness, priority and the rules are RevTaw's own code.
- **Decisions** — the concept's FSRS state is replayed from its answers
  (no separate review log); student ability is the answers-weighted mean
  of concept ratings, shrunk as if by ten answers at 0; bucket refits use
  each student's current concept rating as their ability; FSRS keeps its
  default parameters until a student has enough reviews for the optimizer,
  and BKT's parameters are set, not fitted, until there are enough
  students; evidence is read a page at a time (Supabase returns 1,000 rows
  a request), the latest 10,000 answers per kind.

### The Archive, Tamari's language any time and the level card

- **Delete moves a material to the Archive** — the material page's Delete
  opens a dialog that says what happens ("moves to the Archive… restore it
  there for 30 days") and what always stays; the Materials page then shows
  "Moved to the Archive" with **Undo**. The separate Archive button is gone
  (Delete is the archive). The Archive (Materials → Archive) lists what can
  still come back, the next to go first, each card counting down ("Deletes
  permanently in 12 days (Nov 22, 2026)", in the student's time zone) with
  **Restore** and **Delete permanently**; an archived material's page has a
  banner with the same countdown and both buttons.
- **Delete permanently keeps what was made** — the file in storage, the
  extracted text (chunks and embeddings) and the analysis are deleted for
  good; the material row stays with status `deleted` (`purged_at`, file
  fields cleared), so reviewers, quizzes, flashcard decks, memory aids,
  mistakes, sessions, concepts and mastery keep their material's title,
  subject and folder (Notes, Flashcards, Memory aids, Progress and exams
  still show it). Its page says when the file went and lists what was kept
  ("What you made from it"), with Rename and Move to keep things organized;
  no content tabs and no creation tools. Generation, sessions, Smart Study,
  the tutor's sources, processing, plans and never-practised
  recommendations skip a deleted file (410 "The file behind … was deleted,
  so nothing new can be made from it"); starting a planner task for it opens
  its page instead of a session. Only archived materials can be
  deleted permanently (`purgeMaterialAction`); a deleted one can't be
  restored (and a check constraint keeps it archived).
- **30 days, then gone** (`src/lib/materials/purge.ts`,
  `src/lib/materials/retention.ts`) — materials archived 30+ days ago are
  deleted permanently on the student's own visits (Home and Materials after
  the response with `after()`, the Archive and the material page before
  showing them) and by `/api/cron/archive` once a day (schedules.sql, 3:13
  a.m. Manila time; batches of 50 for about 45 seconds). The row is claimed
  first (status `deleted`), then the file and text go, then `storage_path`
  is cleared, so a restore can't race the purge and a half-finished purge is
  completed on the next run.
- **Migration 0023** — `material_status` gains `deleted`; `materials`
  gains `purged_at` and the check that a deleted file stays archived;
  materials archived before get the full 30 days from the update; an index
  finds what is due.
- **Tamari's language any time** — a "Tamari answers in" picker sits under
  the message box (sized to the chosen language), and saying or typing
  "English please", "Tagalog na lang", "mag-Taglish tayo", "speak Filipino"
  or "answer in my language" switches at once (`languageIn()` in
  `src/lib/tamari/commands.ts`; a bare "English" or "explain photosynthesis
  in Filipino" is not a switch). Tamari confirms in the new language, and
  the choice is saved to the same preference as Settings → Tamari & AI
  (shown at once with `useOptimistic`).
- **Level and badges under the name** — the sidebar and the phone menu show
  the level, XP and the three newest badges (with the count) instead of the
  email, linking to Badges; a ring around the initials fills through the
  current level (`getStanding()` in `src/lib/gamification/standing.ts`:
  two small reads per page, refreshed whenever an action revalidates).

## In Progress

- Nothing at the moment. All ten phases of the specification, the UI/UX
  Improvement and Personalization Phase, the Tamari visual AI companion
  integration, the API integrations round, the learning engine round and
  the Archive round are implemented. The services still need the owner's
  real keys (see Environment Requirements); the hosted database has
  0001–0022 and needs 0023 (the Archive).

## Next (priority order)

1. Tune the learning engine on real answers: calibration of predicted
   against actual correctness, next-day retests, the FSRS optimizer per
   student once they have about a thousand reviews, and BKT parameters
   fitted across students (pyBKT in the Python worker the research doc
   allows).
2. Background jobs for long generations (reviewers, quizzes, analysis of very
   long materials); the daily plan adjustment could move to the reminder
   scheduler (it still runs on page load).
3. Web Push for reminders when no RevTaw tab is open (email and in-app
   already work).
4. Pagination of the Content tab for very large materials; map-reduce
   analysis for books.
5. A Redis-backed rate limiter (and shared AI cooldowns) when running
   several instances.
6. More Tamari poses (happy, confused, Pomodoro, a wrong-answer face) and
   blink frames for the other poses: one picture set in
   `src/components/tamari/sprites.ts` and a line in `src/lib/tamari/states.ts`
   each.

## Database

| Table | Purpose | Ownership |
| --- | --- | --- |
| `public.profiles` | One row per `auth.users` row: display name, education level, main goal, preferred session minutes, onboarding timestamp, time zone, `xp` (kept in step with the ledger by trigger), `preferences` (JSON by section, ≤16 KB, saved with `set_preference_section()`) | RLS: owner may select/insert/update; no delete policy (cascade from `auth.users`) |
| `public.subjects` | Top-level organisation (name, colour, archived_at) | owner full access; `(id, user_id)` unique for composite FKs |
| `public.folders` | Grouping inside a subject (chapter, topic…) | owner full access; FK `(subject_id, user_id)` |
| `public.materials` | One upload or note: title, source, file metadata, `storage_path`, `content_hash`, status + detail (`deleted` once the file is gone), counts, `last_opened_at`, `archived_at` (in the Archive: deleted permanently 30 days later), `purged_at` (when the file, text and analysis were deleted; the row stays for what was made from it, migration 0023) | owner full access; composite FKs to subject and folder (folder must belong to the subject); a deleted file stays archived (check) |
| `public.material_chunks` | Ordered extracted text with heading and page range; `embedding` (BGE-M3, `halfvec(1024)`), `embedding_model`, `embedded_at` and a generated `simple` full-text `search_tsv` (migration 0017) | owner full access; cascade from material |
| `public.material_analyses` | One AI analysis per material: summary, difficulty, minutes, coverage, validated `data` JSON, provider/model | owner full access; cascade from material |
| `public.concepts` | Master concept list per student (`name`, `normalized_name`, origin material/subject) | owner full access; unique `(user_id, normalized_name)` |
| `public.reviewers` | Generated reviewer: kind, title, status + detail, provider/model, `last_opened_at`, `archived_at` | owner full access; cascade from material |
| `public.reviewer_sections` | Ordered sections (heading, markdown content, `edited_at`, `regenerated_at`, generated `search_text`) | owner full access; cascade from reviewer; GIN full-text index |
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
| `public.flashcards` | Card: front/back/hint, concept, source, favorite, suspended, Leitner `box` (a view of FSRS stability), `interval_days`, `repetitions`, `lapses`, `due_at`, last review/rating, FSRS `fsrs_stability`, `fsrs_difficulty`, `fsrs_state`, `fsrs_learning_steps`, `fsrs_scheduled_days` (migration 0022; `ease` is left from SM-2), generated `search_text` | owner full access; cascade from deck; partial index on due cards; GIN full-text index |
| `public.flashcard_reviews` | Review log: rating, response time, box before/after, interval, due date, optional session, FSRS state, stability, difficulty and the recall just before (`retrievability`) | owner full access; cascade from card |
| `public.tutor_conversations` | Tutor chat: material, optional study session, mode, title, message count, last message | owner full access; material/session FKs set null |
| `public.tutor_messages` | One turn: role, content, quick action, selection, grounding, `sources` JSON, additional explanation, follow-ups, flashcard draft, optional `visual`, provider/model | owner full access; cascade from conversation |
| `public.concept_mastery` | Recomputable cache per student and concept: mastery, retrieval strength, status, next difficulty, counters, streak, open mistakes, misconceptions, underconfident, average confidence/response time, trend, last practised, next review; and the learning engine's `p_learned`, `recall`, `elo_rating`, `elo_answers`, `elo_start` (kept: where the rating starts), `weakness`, `first_attempts`, `gates`, `next_step`, `best_status`, the concept's FSRS state (migration 0022) | owner full access; unique `(user_id, concept_id)`; cascade from concept |
| `public.item_buckets` | Shared question difficulty (logits) per difficulty label × question type × concept category, with the answers it was fitted on and when (migration 0022) | signed-in students may select (no personal data); written only by the server's secret key (the night run) |
| `public.exams` | An exam: title, date, subject, priority, confidence, topics, notes, `archived_at` | owner full access; subject FK set null |
| `public.exam_materials` | Materials an exam covers, with position | owner full access; cascade from exam and material |
| `public.study_plans` | One plan per exam: mode (exam/cram), status, start/end, `available_days`, `minutes_per_day`, `settings` (warnings), `generated_at`, `adjusted_at`, `adjustment_note` | owner full access; unique `exam_id`; cascade from exam |
| `public.study_tasks` | A scheduled activity: kind (plan/review/custom), method (`activity` for plain calendar items), title, reason, `scheduled_for`, `starts_at` (local time), position, minutes, concepts, status (pending/done/skipped/missed), `session_id`, `completed_at`, `subject_id`, `priority`, `notes`, `category`, `reminder` + `reminder_minutes` | owner full access; cascade from plan/exam; material, session and subject FKs clear their own column |
| `public.reminders` | One per activity with a reminder: `remind_at`, status (pending/sent/cancelled), `in_app_sent_at`, `email_sent_at`, `email_attempts`, `email_error`, `claimed_until` | owner full access; cascade from the task; `claim_due_reminders()` for the service role only |
| `public.study_goals` | A goal: kind, period (day/week/once), target, optional material/subject, title, `due_date`, status | owner full access; cascade from material/subject |
| `public.notifications` | Reminder feed: kind (incl. `achievement`, `level_up`, `reminder`), title, body, href, `dedupe_key`, `read_at` | owner full access; unique `(user_id, dedupe_key)` |
| `public.xp_events` | XP ledger: source (answers, session, reviews, mastered, goal, streak_day, achievement), `source_key` (idempotent award), points, label | owner full access; unique `(user_id, source_key)`; trigger `apply_xp_event` adds to `profiles.xp` |
| `public.achievements` | Unlocked badges: key, `unlocked_at`, `seen_at` (definitions live in `src/lib/gamification/achievements.ts`) | owner full access; unique `(user_id, key)` |
| `public.ai_usage` | Daily AI use per student, Philippine day and kind (chat, generate, study, upload, voice): requests, input and output tokens (for voice: seconds heard, characters read aloud) | owner may select; written only through `consume_ai_request()` (the caller's own row, counting up), `add_ai_tokens()` and `refund_ai_request()` (service role only) |
| `public.email_digests` | One row per student and local day: status (claimed, sent, skipped, failed), sent time, error — so a digest goes out once | owner may select; the scheduler writes |
| `public.calendar_connections` | Google Calendar link: provider, "RevTaw Study" calendar id, encrypted refresh token (`v1:` AES-256-GCM), scope, status (connected, needs_reconnect, error), last sync, last error | owner may select the non-secret columns (column grant without `refresh_token` and `scope`); the server writes |
| `storage.objects` (bucket `materials`) | Private files under `<user_id>/<material_id>/<file>` | policies on first path segment = `auth.uid()` |

Enums: `education_level`, `study_goal`, `material_source`, `material_status` (incl. `deleted`, migration 0023),
`difficulty_level`, `reviewer_kind`, `generation_status`, `question_type`,
`question_difficulty`, `quiz_mode`, `attempt_status`, `confidence_level`,
`mistake_type`, `session_status`, `session_goal`, `flashcard_rating`,
`tutor_mode` (incl. `teach_back`), `tutor_role`, `mastery_status` (incl. `developing`, migration 0022), `next_difficulty`,
`exam_priority`, `plan_mode`, `plan_status`, `task_kind`, `task_status`,
`goal_kind`, `goal_period`, `goal_status`, `notification_kind`. Helper functions: `public.set_updated_at()`,
`public.handle_new_user()` and `public.apply_xp_event()` (security definer, pinned `search_path`),
`public.set_preference_section()` (security invoker), `public.claim_due_reminders()`
(service role only, `for update skip locked`), `public.consume_ai_request()` (security
definer, the caller's own row only), `public.add_ai_tokens()` and
`public.refund_ai_request()` (service role only), `public.match_material_chunks()` and
`public.save_chunk_embeddings()` (security invoker). Extensions: `vector` (pgvector) and
`pg_trgm` in the `extensions` schema.

Full-text search (migration 0011): GIN indexes on
`to_tsvector('english', …)` over `materials.title`, `material_chunks.content`,
`reviewers.title`, `reviewer_sections.search_text`, `quiz_questions.prompt`,
`flashcards.search_text`, `concepts.name`, `tutor_conversations.title` and
`tutor_messages.content`; queries use PostgREST's `wfts` (websearch) operator.
Tamari's passage search (migration 0017) adds a `simple` full-text vector,
trigram matching and vector similarity over `material_chunks`, fused in
`match_material_chunks()`; there is no vector index yet (exact search over one
student's chunks is fast; add HNSW past about 2,000 chunks a student).

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
  `src/components/app/nav-items.ts` (groups, pinned tools, phone tabs);
  command menu entries from `src/components/app/commands.ts`.
- **Preferences and theming** — `src/lib/preferences/` (schema with strict
  input and lenient reader per section, cached `getPreferences()`, one
  Server Action per section, rate-limited); `src/lib/theme/` (OKLCH palette
  builder, appearance cookie). The root layout sets `data-accent`,
  `data-motion` and custom-color variables on `<html>` from the cookie;
  `AppearanceRoot` keeps the cookie in step with the account.
- **Tamari (the assistant)** — `src/components/assistant/`:
  `AssistantProvider` (in the signed-in layout: the chat button
  `ChatLauncher`, a stack of page registrations, request queue, lazy panel,
  and everything about how Home's Tamari looks right now: activity, its
  nap line, naps, reactions), two contexts — the chat API (`useAssistant()`)
  and Tamari's picture (`useTamari()`: state, reaction, bubble, settings,
  `seat()`, `react()`) — `useTamariActivity()` (work in progress shows as
  learning), `AssistantPage`/`AssistantLauncher` (pages, or a part of one
  such as a picked planner task, register context and how the chat button
  behaves), `assistant-panel.tsx` (native `<dialog>`: `show()`
  on desktop, `showModal()` on phones; Tamari's commands), `openAssistant()`
  for any button. Page context is a discriminated union of ids
  (`src/lib/assistant/context-schema.ts`, now with planner tasks) resolved
  by `resolvePageContext()` with the student's session and added to the
  tutor prompt inside `<page_context>` as data, with a study snapshot when
  `asksAboutStudyData()` matches. Tamari's pieces: `src/lib/tamari/`
  (`states.ts` registry, `lines.ts` bubbles and replies in three languages,
  `coach.ts` Home lines, `hints.ts` picks them, `plan.ts` the time-boxed
  plan, `commands.ts` natural commands) and `src/components/tamari/`
  (`sprites.ts` with blink frames, `TamariSprite`, `TamariHome` on Home,
  `TamariPerch` (the seated, clickable Tamari), `TamariSays` (Tamari's
  words on a plan), `useTamariMove()` to start what a line offers); the
  motions are the `.tamari-*` classes in `globals.css`.
- **Voice** — `src/lib/voice/`: `types.ts` (SpeechToText / TextToSpeech
  interfaces), `web-speech.ts` (default provider, loaded on first use),
  `recorder.ts` + `/api/voice/transcribe` (server speech-to-text where the
  browser has none), `server-tts.ts` + `/api/voice/speak` (Azure's Filipino
  voice where the device has none), `audio-unlock.ts` (iPhone playback),
  `server.ts` (Whisper and Azure calls, server-only), `intents.ts`
  (commands, confirmations), `speech-text.ts` (what to read, which
  language); `use-voice.ts` in the assistant picks the providers.
- **Planner calendar and reminders** — `src/lib/planner/calendar.ts`
  (month grid), `src/lib/planner/time.ts` (clock times, zoned instants),
  `saveActivity()` in the planner service; `src/lib/reminders/` (`time.ts`
  reminder instants and wording, `message.ts` bell/email content with
  escaping, `service.ts` sync, delivery and the scheduler run),
  `src/lib/notifications/email.ts` (Resend over HTTPS with an idempotency
  key; `email-config.ts`, `unsubscribe.ts`, `digest.ts`), `ReminderWatcher`
  in the app layout, `/api/reminders` and `/api/cron/reminders` (Bearer
  `CRON_SECRET`, timing-safe compare in `src/lib/server/cron-auth.ts`).
- **Email links** — `/auth/callback` (PKCE `code`) and `/auth/confirm`
  (`token_hash`). The latter works across browsers/devices; see
  `supabase/README.md` for email templates. Redirects use
  `NEXT_PUBLIC_SITE_URL`, never the internal request origin; links in
  reminder and digest emails and calendar events use `getPublicSiteUrl()`,
  which never falls back to localhost in production.
- **Materials pipeline** — `src/lib/materials/`: `detect.ts` (magic numbers),
  `extract.ts` (per-type extraction), `chunk.ts` (heading/page aware
  chunking), `analyze.ts` (prompt + transcript budget), `pipeline.ts`
  (status machine, dedup, analysis step), `storage.ts` (object paths,
  signed uploads, removal). Processing runs inside route handlers with
  `maxDuration = 120`; move it to a queue/edge function if materials
  regularly exceed that.
- **AI** — `src/lib/ai/`: `getAiProvider(tier)` returns every configured
  provider behind `AiRouter` (or the one `AI_PROVIDER` names), wrapped in
  `MeteredProvider` (`quota.ts`, the daily allowance). Groq, Cloudflare and
  Ollama share `OpenAiCompatibleProvider`; `budget.ts` estimates request
  sizes; `http.ts` maps HTTP errors to `AiError` codes. `embeddings.ts`
  makes BGE-M3 vectors. `mock` is automatic in development without keys and
  must be set explicitly in production. `generateJson()` validates with zod
  and asks the model to repair once (free of the allowance). Student
  context (education level, goal) is passed to prompts.
- **Google Calendar** — `src/lib/calendar/`: `google.ts` (OAuth URLs, PKCE,
  token exchange and refresh, Calendar API calls), `crypto.ts` (AES-256-GCM
  for refresh tokens), `oauth-cookie.ts` (state and verifier, ten
  minutes), `events.ts` (activity and exam → event, content hash),
  `sync.ts` (one-way reconcile, one run at a time per student, the hourly
  job), `actions.ts` and `queries.ts`; routes `/api/calendar/google/connect`
  and `/callback`, `/api/cron/calendar`. Planner actions call
  `syncCalendarAfterChange()`.
- **Usage analytics** — `src/lib/analytics/server.ts`: `track()` after the
  response, only with the student's opt-in, allowlisted events and
  properties, HMAC pseudonym from a server-only secret.
- **Service check** — `src/lib/server/service-check.ts` behind
  `/api/system/services` (owner only; `?live=1` for real calls).
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
- **Flashcards** — `src/lib/flashcards/`: `scheduler.ts` (FSRS-6 card
  scheduling through the engine, history replay for SM-2-era cards, the
  buttons' waits), `labels.ts` (client-safe boxes and rating labels),
  `generate.ts`, `service.ts` (deck generation, `reviewCard` = reschedule +
  log + session counters), `queries.ts` (decks with due counts, review
  queues with each card's waits, due counts), `actions.ts`.
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
  Replies use the strong tier within Groq's free budget (see the API
  integrations round) and are not streamed (one validated JSON object per
  turn). Passages come from `rankMaterialChunks()` (hybrid search) when it
  is available, else from keyword scoring.
- **Learning engine** — `src/lib/engine/` (pure, client-safe): `config.ts`
  (every tunable number), `answers.ts` (reading an answer), `bkt.ts`,
  `fsrs.ts` (ts-fsrs wrapper: replay, review, preview, recall, Leitner
  view), `elo.ts` (ratings, buckets, the bucket fit, next difficulty),
  `weakness.ts`, `priority.ts`, `method-rules.ts`, `mastery-model.ts` (one
  concept's model from its answers) and `types.ts` (the six states).
- **Adaptive engine** — `src/lib/adaptive/`: `mastery.ts` (labels, state
  bands, next steps, refresh), `evidence.ts` (the evidence and context the
  model reads, paged, filtered by student), `engine.ts`
  (`recomputeMasteryFor()` for the student's or the secret-key client,
  stale refresh on read, mastery views and summary, weak concepts,
  difficulty targets and the default difficulty), `focus.ts` (priority
  ranking and the rule table's method per concept), `recommend.ts` (ranked
  recommendations with reasons), `smart.ts` (Smart Study planner, plan
  schema in `study_sessions.state`, block bookkeeping, combined summary),
  `nightly.ts` (bucket refit, exam boosters, stale recompute). UI in
  `src/components/adaptive/` (mastery bar/table, recommendation list,
  material mastery) and `src/components/study/smart-session.tsx`. Mastery
  is a cache: deleting the rows and answering anything rebuilds them.
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
- **Export** — `src/lib/export/`: `model.ts` (the document model and
  markdown → blocks), `sources.ts` (one builder per export kind, reading
  through the signed-in client), `html.ts`, `docx.ts`, `pdf.tsx` (the three
  renderers; `@react-pdf/renderer` is a server external package), and the
  route `src/app/api/export/[kind]/route.ts`. `src/components/export/
  export-menu.tsx` is the shared menu.
- **Search** — `src/lib/search/queries.ts` (`globalSearch()`: six grouped
  full-text queries in parallel, snippets, links), `src/components/app/
  search-box.tsx` (sidebar and page boxes, `/` shortcut) and
  `src/app/(app)/search/page.tsx`; `src/lib/search/hybrid.ts` ranks a
  material's passages for Tamari and fills in embeddings.
- **Client clock** — `src/lib/hooks/use-now.ts` is the only way client
  components read the current time during render (see the hydration review
  in Phase 10).
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
- Image materials need a vision-capable provider (Cloudflare's Mistral
  Small 3.1, Anthropic, OpenAI or a named Gemini); Groq and Ollama are
  skipped for them. Without one they fail with a clear message.
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
  per evidence table scoped to the touched concepts), once a day on read
  and by the night run; very large histories would benefit from
  incremental updates (the latest 10,000 answers per kind are read).
- The learning engine's numbers are the research doc's starting values:
  until there are real answers to calibrate against, FSRS uses its default
  parameters, BKT its set guess/slip/learn values and the buckets their
  label priors (a bucket needs answers from several students to move).
- Session items and flashcard generation also run inside a single request
  (`maxDuration = 120` for routes; Server Actions for sessions). Very long
  materials rely on the transcript budget.
- The daily plan adjustment runs when the dashboard, planner or exam page
  loads; the daily feed (reviews due, exam countdown, planned tasks, goals,
  streak) is generated the same way. Planner activity reminders have their
  own queue and scheduler (see the UI/UX phase).
- Plan generation is rule-based and deterministic (no model call); it uses
  each material's analysis, mastery, open mistakes and decks.
- Smart Study plans are rule-based (budget split by what the data shows);
  exam pacing is the planner's job and fixed habits are custom routines.
- Blurting sections follow the material's headings (inline headings split
  long chunks); notes without headings become a few long sections.
- Question generation evaluates one question per model call; interleaving
  mixes up to four materials; rapid review is 5, 10 or 15 minutes by
  design.
- Calendar activities start the Phase 4 methods (or are plain items with no
  session); plan-generated tasks already use exam simulation and rapid
  review.
- Tutor replies arrive as one message (no token streaming). Passages are
  found by hybrid search once a material has embeddings (Cloudflare
  needed); until then, and without Cloudflare, by keyword overlap.
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
- PDF exports use the standard Helvetica/Courier fonts (Latin text; no
  embedded font files), so scripts outside Latin-1 may not render in the
  PDF — the Word and printable exports are unaffected. Exports are limited
  to 30 a minute per user.
- Search stems in English; a material in another language is still found
  by exact words. Each group shows its first eight hits (no paging) and a
  query is capped at 120 characters.
- Dates and numbers are formatted in `en-US` throughout (the UI is
  English); a per-user locale is a later refinement.
- Voice uses the browser's Web Speech API where it exists (Chrome and Edge
  send speech to their vendor for recognition). Elsewhere a short clip goes
  to RevTaw's server and on to Groq or Cloudflare's Whisper (not stored);
  without those keys the microphone is hidden there. Spoken answers use
  the device's voices; a missing Filipino voice is replaced by Azure's when
  it is configured, else the default voice reads Filipino. Voice limits
  are checked before each call, so two at once can pass a limit by one
  clip.
- Email reminders and the digest need Resend (a verified domain; the free
  plan sends 100 emails a day) and the scheduler
  (`CRON_SECRET` + `SUPABASE_SECRET_KEY` + something calling
  `/api/cron/reminders` every few minutes). Vercel Hobby only runs daily
  cron jobs; use Vercel Pro, GitHub Actions, cron-job.org or Supabase
  pg_cron + pg_net for a 5-minute schedule. Without it, reminders still
  reach the bell and the browser while RevTaw is open, and the bell on the
  next visit.
- Browser notifications show only while a RevTaw tab is open (no Web Push
  yet).
- Tamari's bubbles remember what they said per browser session
  (sessionStorage), so a new tab can repeat one; naps are per tab. The
  wake word only works after the microphone is tapped — Tamari never
  listens on its own.
- Tamari keeps one conversation per material for highlight threads;
  general chats have no material, so "Add to notes" and "Create flashcard"
  appear only in chats about a material.
- AI cooldowns and the route log are kept in memory per server instance,
  so instances learn about a busy provider separately; the per-student
  limits are shared (Postgres). Cloudflare's free daily allowance is shared
  by fallback chat, image reading, Whisper and embeddings.
- Until Google verifies the app, at most 100 test users can connect Google
  Calendar and their access expires after 7 days (they reconnect). The
  sync is one-way: edits made in Google Calendar are overwritten.
- The round's real-provider formats (Cloudflare's Responses API and vision,
  Azure TTS, Google OAuth and Calendar, Resend, PostHog) were tested
  against stand-ins built from their documentation; run the service check
  with real keys before relying on them.

## Environment Requirements

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Required | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable/anon key (public; RLS protects data) |
| `SUPABASE_SECRET_KEY` | recommended | Server-only privileged client: account deletion, the scheduler, AI token and voice counts, refunds, Google Calendar, the analytics pseudonym key |
| `NEXT_PUBLIC_SITE_URL` | in production | Absolute origin for auth redirects, email links and calendar events (Vercel's production domain is used when empty) |
| `GROQ_API_KEY` | recommended | First AI provider (free tier); also speech-to-text |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | recommended | Workers AI: fallback chat, image reading, embeddings for Tamari's search, fallback speech-to-text |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OLLAMA_BASE_URL` | optional | Paid providers and a local Ollama, tried after the free ones; `GOOGLE_AI_API_KEY` only when named |
| `AI_PROVIDER` / `AI_PROVIDER_ORDER` / `AI_MODEL_FAST` / `AI_MODEL_STRONG` | optional | Pin one provider or change the order and models (see `.env.example` for the per-provider model variables) |
| `AI_DAILY_LIMITS` | optional | Requests per student and day by kind, plus `voice_seconds` and `voice_chars`; `off` to disable |
| `GROQ_BASE_URL` / `CLOUDFLARE_AI_BASE_URL` | optional | A gateway in front of the providers (https only) |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` / `AZURE_TTS_VOICE` | optional | Filipino read-aloud where the device has no Filipino voice |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | Email reminders and the digest, from a verified domain; email stays off until set (SMTP is no longer supported) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `CALENDAR_TOKEN_KEY` | optional | Google Calendar sync; redirect URI `<site>/api/calendar/google/callback`; the key is 32 random bytes in base64 |
| `POSTHOG_KEY` / `POSTHOG_HOST` | optional | Opt-in usage analytics on PostHog EU (needs `SUPABASE_SECRET_KEY` or `CRON_SECRET` for pseudonyms) |
| `CRON_SECRET` | optional | 16+ random characters; the bearer token for `/api/cron/*` and the service check |

Supabase dashboard settings needed: email confirmations on, Site URL and
`/auth/callback` redirect URL (see `supabase/README.md`). For the scheduler,
run `supabase/schedules.sql` once (pg_cron + pg_net + Vault).

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
  tabs, re-analyze, rename/move, subjects/folders manager; Delete → the
  Archive (dialog wording, notice with Undo, hidden from the lists, file
  kept, countdown on the card and page, Restore from the card), Delete
  permanently (file, chunks and analysis gone; row kept as `deleted` with
  title, subject and folder; reviewer, deck and memory aid kept and listed
  on the page; Rename and Move only; generation refused with 410; Notes
  still name the material; its planner reviews stay and Start opens the
  page), 30 days later on a visit and by `/api/cron/archive` (401 without
  the secret)
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
  review with keyboard shortcuts (FSRS learning steps and Don't know repeat
  within the session; a new card's buttons show 1 min / 6 min / 10 min /
  8 days), summary and session row, review log with FSRS stability and
  difficulty, boxes/due dates from FSRS (Medium → 2 days, Easy → 8 days,
  Don't know → tomorrow), review-all
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
- Export and search: the export menu offers print, PDF and Word and closes
  on Escape; reviewer, quiz (with and without the answer key), results,
  deck, plan, notebook and progress exports download as real PDFs and
  `.docx` files (unzipped and checked for their headings and tables) and
  the printable page renders without a CSP refusal; unknown ids, bad
  formats and anonymous requests are rejected; the sidebar box and `/`
  shortcut, grouped results with snippets and links, an exact phrase
  finding quiz questions, the empty result and the empty query, the mobile
  search icon
- UI/UX phase: preferences smoke (theme color on the first response, a
  forged cookie ignored, account sync), dashboard customization (show,
  hide, reorder, reset, empty board, persisted), navigation groups and
  pinning, command menu (19 checks incl. keyboard and axe), settings (20
  checks), contrast of every theme color in light and dark; the assistant
  (`assistant-e2e.mjs`: Tamari on Home and the chat button elsewhere, non-modal desktop panel, phone sheet,
  language question, the language picker and "Tagalog na lang" / "answer in
  my language" / "mag-Taglish tayo" switching it any time without a chat
  message, context across pages, new chat about the page, quick
  actions, add to notes, restore after reload, history, expand, Escape,
  highlight-and-ask in the material's thread, command menu, quiz results
  suggestion and "Ask Tamari why", hidden during a quiz and on the tutor,
  Show Tamari / chat button / pixel animations in settings, axe light/dark/phone);
  Tamari (`tamari-e2e.mjs`: at the start of Home's Continue card and shown
  once, silent until clicked with a "!" for a waiting line, the line from
  the data in exam mode in a compact bubble, Escape / outside click / the
  chat button, "Later" for the day and the 10/20/30-minute offer, a blink
  frame, a 10-minute plan with Tamari's words, no Tamari and no pop-up line
  on other pages but a round chat button fully on screen that opens the
  chat and comes back with the focus, a nap on Home and "Uy, buhay ka pa
  pala. Review?", each setting, phone, axe); commands (`commands-e2e.mjs`:
  "20 minutes lang ako" → a 3/7/5/3/2 plan, a question stays a question,
  "Quiz mo 'ko dito" → a quiz and the chat steps aside, "May exam ako
  Friday" → the exam form on Friday, "Move this to Friday" after a yes);
  voice (`voice-e2e.mjs`
  with a stand-in speech engine: commands, Taglish, live words, spoken
  answers without markdown, save with spoken "oo", theme, blocked
  microphone, Escape, no mic without recognition, Permissions-Policy, voice
  off in settings, "Tamari" alone, "open my … material" by name, a
  weak-topics question answered from the study snapshot);
  calendar and reminders (`calendar-e2e.mjs`: empty-day form, every field
  saved, reminder at 2:00 PM Manila time, edit to a custom reminder,
  filters, keyboard grid and month paging, study activities start, a due
  reminder as a browser notification and a bell row, the scheduler's
  secret, one email through a test Resend sink, nothing sent twice, delivery
  while away and on the next visit, done/reopen/delete, deleting a
  material with reviews, phone layout, axe light/dark); migrations 0012,
  0013, 0014 and 0015 tested in SQL (RLS, cross-student references,
  claiming)
- API integrations round, against stand-ins for every provider:
  `airouter-e2e.mjs` (Groq's 429 → Cloudflare's Responses API, the
  cooldown and its end, an over-budget turn skipping Groq, the daily chat
  limit with no provider called, token counts, the service check hidden
  from students and never showing keys, live checks of both tiers and
  vision); `search-e2e.mjs` (every chunk embedded on upload with its
  heading, stored as a 1,024-dimension halfvec, the question embedded and
  Tamari answering from the passage it means, a duplicate upload reusing
  the embeddings, the backfill job behind the secret, the service check);
  `voiceserver-e2e.mjs` (a real recording from a fake microphone → Groq
  Whisper as multipart with verbose_json → "open the planner"; Groq busy →
  Cloudflare; a Taglish answer read by the Azure voice from plain-text
  SSML; requests and seconds counted; the seconds limit explained with
  nothing sent); `digest-e2e.mjs` (nothing before the opt-in, an empty day
  skipped, one digest with escaped content, unsubscribe headers and the
  day's idempotency key, never twice, a tampered link refused, a link
  scanner changing nothing, one-click unsubscribe keeping the other
  settings); `gcal-e2e.mjs` (declining at Google, one narrow scope with
  offline access and PKCE, the code exchanged with the verifier, the
  calendar created in the student's zone, the token encrypted and hidden
  from students, activities and the exam written, a done activity
  rewriting one event, Sync now removing a deleted one, nothing written
  when nothing changed, the hourly job, disconnect revoking at Google);
  `analytics-e2e.mjs` (nothing before the opt-in, the choice saved, an
  anonymous event with allowlisted properties and no profile or GeoIP, no
  account id, email, name or message text, opting out stopping events);
  migrations 0016–0021 in SQL (a student cannot add tokens, refunds and
  token counts by the service role only, hybrid search and saved
  embeddings limited to the student's own chunks, typos matched)
- Accessibility: `~/preview/a11y-audit.mjs` (axe-core, 43 states incl. the
  new settings pages, the activity form and Tamari's chat, light) and
  `a11y-dark.mjs` (dark) report no violations; keyboard paths are
  exercised by the suites above (flashcard flip with Space, rating keys,
  Escape on dialogs and menus)
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
  levels, badge rules and the longest-streak helper, the export document
  model (markdown → blocks, file slugs) and search snippets; theme palettes
  and contrast, preferences schemas, dashboard layout moves, command
  matching, response-style rules, mixed-quiz type coverage, voice intents
  and speech text, month grids, zoned times, reminder instants and
  messages, and the email sender (mocked provider); the AI router,
  budgets, cooldowns, the OpenAI-compatible adapter and the daily
  allowance (voice seconds and characters included), embeddings and hybrid
  ranking, Whisper and Azure requests, the digest and unsubscribe tokens,
  calendar encryption, events and sync, analytics payloads, endpoint and
  site-address checks; the learning engine (BKT, answer readings, Elo and
  the bucket fit, FSRS replay/preview/Leitner view, weakness, the priority
  worked example, the method rules, the concept model's gates and states),
  FSRS card scheduling, evidence paging and the Tamari plan's new-concept
  block

Commands: `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest unit tests),
`npm run build`.

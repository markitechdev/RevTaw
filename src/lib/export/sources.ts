import "server-only";

import { getMasterySummary, listMastery } from "@/lib/adaptive/engine";
import { STATUS_LABEL } from "@/lib/adaptive/mastery";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { bullets, callout, formatExportDate, heading, keyValues, markdownBlocks, paragraph, table, type ExportBlock, type ExportDocument, type ExportSection } from "@/lib/export/model";
import { getDeck } from "@/lib/flashcards/queries";
import { getGamificationView } from "@/lib/gamification/sync";
import { formatDate } from "@/lib/planner/dates";
import { getExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { PLAN_MODE_LABEL, TASK_STATUS_LABEL } from "@/lib/planner/types";
import { getAttemptResults, listMistakes } from "@/lib/quizzes/queries";
import { answerSchema, describeAnswer, DIFFICULTY_LABEL, MISTAKE_TYPE_LABEL, QUESTION_TYPE_BY_ID, QUIZ_MODE_LABEL, type QuestionAnswer, type QuestionOption } from "@/lib/quizzes/types";
import { REVIEWER_KIND_BY_ID } from "@/lib/reviewers/kinds";
import { getReviewer } from "@/lib/reviewers/queries";
import { methodName } from "@/lib/study/catalog";
import { createClient } from "@/lib/supabase/server";

/**
 * What each exportable thing becomes (spec §34): notes and reviewers, quiz
 * questions, quiz results, flashcards, study plans, the mistake notebook and
 * progress reports. Every builder reads through the signed-in client, so RLS
 * decides what can be exported.
 */

export const EXPORT_KINDS = ["reviewer", "quiz", "results", "deck", "plan", "mistakes", "progress"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const footer = () => `Exported from RevTaw on ${formatExportDate()}`;

function answerText(answer: QuestionAnswer, options: QuestionOption[] | null): string {
  if ("option_id" in answer || "value" in answer) return describeAnswer(answer, options);
  if ("accepted" in answer) return answer.accepted.join(" / ");
  return `${answer.model_answer}${answer.rubric.length ? ` (rubric: ${answer.rubric.join("; ")})` : ""}`;
}

/** A reviewer or a note (notes are reviewers of the "notes" kinds). */
export async function buildReviewerExport(id: string): Promise<ExportDocument | null> {
  const reviewer = await getReviewer(id);
  if (!reviewer) return null;
  return {
    title: reviewer.title,
    subtitle: `${REVIEWER_KIND_BY_ID[reviewer.kind]?.name ?? reviewer.kind}${reviewer.material ? ` · ${reviewer.material.title}` : ""}`,
    meta: [reviewer.material?.subject?.name ?? null, `${reviewer.sections.length} section${reviewer.sections.length === 1 ? "" : "s"}`, `Updated ${formatExportDate(reviewer.updated_at)}`].filter((entry): entry is string => Boolean(entry)),
    sections: reviewer.sections.map((section) => ({ heading: section.heading, blocks: markdownBlocks(section.content) })),
    footer: footer(),
  };
}

/** The questions of a quiz, optionally followed by the answer key. */
export async function buildQuizExport(id: string, options: { answers: boolean }): Promise<ExportDocument | null> {
  const supabase = await createClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    supabase.from("quizzes").select("id, title, created_at, question_count, material:materials!quizzes_material_fk(title)").eq("id", id).maybeSingle(),
    supabase.from("quiz_questions").select("position, type, difficulty, prompt, options, answer, explanation, points, concept:concepts!quiz_questions_concept_fk(name)").eq("quiz_id", id).order("position"),
  ]);
  if (!quiz) return null;
  const rows = (questions ?? []).map((question) => ({ ...question, parsedOptions: (question.options as unknown as QuestionOption[] | null) ?? null, parsedAnswer: answerSchema.safeParse(question.answer) }));
  const questionBlocks: ExportBlock[] = [];
  rows.forEach((question, index) => {
    const concept = (question.concept as unknown as { name: string } | null)?.name;
    questionBlocks.push(heading(`${index + 1}. ${question.prompt}`, 3));
    questionBlocks.push(paragraph(`${QUESTION_TYPE_BY_ID[question.type]?.name ?? question.type} · ${DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty} · ${question.points} point${question.points === 1 ? "" : "s"}${concept ? ` · ${concept}` : ""}`, true));
    if (question.parsedOptions?.length) questionBlocks.push(bullets(question.parsedOptions.map((option) => `${option.id.toUpperCase()}. ${option.text}`)));
    else if (question.type === "true_false") questionBlocks.push(bullets(["True", "False"]));
    else questionBlocks.push(paragraph("Answer: ______________________________________________", true));
  });
  const sections: ExportSection[] = [{ heading: "Questions", blocks: questionBlocks }];
  if (options.answers) {
    sections.push({
      heading: "Answer key",
      blocks: [
        { type: "pageBreak" },
        table(
          ["#", "Answer", "Explanation"],
          rows.map((question, index) => [String(index + 1), question.parsedAnswer.success ? answerText(question.parsedAnswer.data, question.parsedOptions) : "—", question.explanation ?? ""]),
        ),
      ],
    });
  }
  const material = (quiz.material as unknown as { title: string } | null)?.title;
  return {
    title: quiz.title,
    subtitle: options.answers ? "Questions with answer key" : "Questions",
    meta: [material ?? null, `${rows.length} question${rows.length === 1 ? "" : "s"}`, `Created ${formatExportDate(quiz.created_at)}`].filter((entry): entry is string => Boolean(entry)),
    sections,
    footer: footer(),
  };
}

/** The results of a submitted attempt: score, breakdown by concept, every question with the student's answer. */
export async function buildResultsExport(attemptId: string): Promise<ExportDocument | null> {
  const results = await getAttemptResults(attemptId);
  if (!results || results.attempt.status !== "submitted") return null;
  const percent = results.attempt.max_score ? Math.round(((results.attempt.score ?? 0) / results.attempt.max_score) * 100) : null;
  const questionBlocks: ExportBlock[] = [];
  results.questions.forEach((question, index) => {
    questionBlocks.push(heading(`${index + 1}. ${question.prompt}`, 3));
    questionBlocks.push(
      keyValues([
        { label: "Result", value: question.isCorrect === null ? "Not graded" : question.isCorrect ? "Correct" : "Incorrect" },
        { label: "Your answer", value: question.studentAnswer ?? "(blank)" },
        { label: "Correct answer", value: question.correctAnswer },
      ]),
    );
    if (question.explanation) questionBlocks.push(callout("Explanation", question.explanation));
    if (question.feedback) questionBlocks.push(callout("Feedback", question.feedback));
  });
  return {
    title: `${results.quiz.title} — results`,
    subtitle: `${QUIZ_MODE_LABEL[results.attempt.mode] ?? results.attempt.mode} attempt${results.attempt.submitted_at ? ` · submitted ${formatExportDate(results.attempt.submitted_at)}` : ""}`,
    meta: [percent === null ? null : `Score ${percent}%`, `${results.attempt.correct_count ?? 0} of ${results.attempt.question_count ?? results.questions.length} correct`].filter((entry): entry is string => Boolean(entry)),
    sections: [
      {
        heading: "Summary",
        blocks: [
          keyValues([
            { label: "Score", value: percent === null ? "—" : `${percent}%` },
            { label: "Points", value: `${results.attempt.score ?? 0} / ${results.attempt.max_score ?? 0}` },
            { label: "Correct", value: `${results.attempt.correct_count ?? 0} / ${results.attempt.question_count ?? results.questions.length}` },
          ]),
          table(["Concept", "Correct", "Questions"], results.conceptSummary.map((entry) => [entry.name, String(entry.correct), String(entry.total)])),
        ],
      },
      { heading: "Questions", blocks: questionBlocks },
    ],
    footer: footer(),
  };
}

export async function buildDeckExport(deckId: string): Promise<ExportDocument | null> {
  const deck = await getDeck(deckId);
  if (!deck) return null;
  const cards = deck.cards.filter((card) => !card.suspended);
  return {
    title: deck.title,
    subtitle: `Flashcards${deck.material ? ` · ${deck.material.title}` : ""}`,
    meta: [`${cards.length} card${cards.length === 1 ? "" : "s"}`, `${deck.cards.filter((card) => card.favorite).length} favorite${deck.cards.filter((card) => card.favorite).length === 1 ? "" : "s"}`],
    sections: [
      { heading: "Cards", blocks: [table(["#", "Front", "Back", "Hint"], cards.map((card, index) => [String(index + 1), card.front, card.back, card.hint ?? ""]))] },
      { heading: "Study them", blocks: [paragraph("Cover the Back column, read the Front, say the answer out loud, then check. Mark the ones you missed and come back to them first next time.", true)] },
    ],
    footer: footer(),
  };
}

/** An exam's study plan, day by day. */
export async function buildPlanExport(examId: string): Promise<ExportDocument | null> {
  const exam = await getExam(examId);
  if (!exam) return null;
  const { today } = await plannerClock();
  const byDay = new Map<string, typeof exam.tasks>();
  for (const task of exam.tasks) byDay.set(task.scheduled_for, [...(byDay.get(task.scheduled_for) ?? []), task]);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    title: `${exam.title} — study plan`,
    subtitle: `Exam on ${formatDate(exam.exam_date, today)}${exam.subject ? ` · ${exam.subject.name}` : ""}`,
    meta: [exam.plan ? PLAN_MODE_LABEL[exam.plan.mode] : null, exam.plan ? `${exam.plan.minutes_per_day} min per day` : null, `${exam.tasksDone} of ${exam.tasksTotal} tasks done`, exam.readiness === null ? null : `Readiness ${exam.readiness}%`].filter((entry): entry is string => Boolean(entry)),
    sections: [
      {
        heading: "Materials",
        blocks: [exam.materials.length ? bullets(exam.materials.map((material) => material.title)) : paragraph("No materials attached.", true), ...(exam.topics.length ? [paragraph(`Topics: ${exam.topics.join(", ")}`)] : []), ...(exam.notes ? [callout("Notes", exam.notes)] : [])],
      },
      {
        heading: "Day by day",
        blocks: days.length
          ? days.flatMap(([date, tasks]) => [heading(formatDate(date, today), 3), table(["Task", "Method", "Minutes", "Status", "Why"], tasks.map((task) => [task.title, methodName(task.method), String(task.minutes), TASK_STATUS_LABEL[task.status], task.reason ?? ""]))])
          : [paragraph("No tasks yet — generate the plan in the Planner.", true)],
      },
    ],
    footer: footer(),
  };
}

export async function buildMistakesExport(options: { resolved: boolean }): Promise<ExportDocument> {
  const mistakes = await listMistakes({ resolved: options.resolved });
  return {
    title: options.resolved ? "Mistake notebook — learned" : "Mistake notebook",
    subtitle: options.resolved ? "Mistakes you have marked as learned" : "Mistakes still to review",
    meta: [`${mistakes.length} entr${mistakes.length === 1 ? "y" : "ies"}`],
    sections: [
      {
        heading: null,
        blocks: mistakes.length
          ? mistakes.flatMap((mistake, index) => [
              heading(`${index + 1}. ${mistake.question_text}`, 3),
              keyValues([
                { label: "Your answer", value: mistake.student_answer ?? "(blank)" },
                { label: "Correct answer", value: mistake.correct_answer },
                { label: "Error type", value: MISTAKE_TYPE_LABEL[mistake.error_type] },
              ]),
              ...(mistake.explanation ? [callout("Why", mistake.explanation)] : []),
              paragraph([mistake.concept?.name, mistake.material?.title, formatExportDate(mistake.created_at)].filter(Boolean).join(" · "), true),
            ])
          : [paragraph("Nothing here — every wrong quiz answer lands in the notebook automatically.", true)],
      },
    ],
    footer: footer(),
  };
}

/** A progress report: the figures of the Progress page plus every concept's mastery. */
export async function buildProgressExport(): Promise<ExportDocument> {
  const [analytics, summary, rows, gamification] = await Promise.all([getAnalyticsOverview(), getMasterySummary(), listMastery(), getGamificationView()]);
  const practiced = rows.filter((row) => row.attempts > 0);
  return {
    title: "Progress report",
    subtitle: `Last 30 days up to ${formatExportDate()}`,
    meta: [`Level ${gamification.level.level}`, `${gamification.xp.toLocaleString("en-US")} XP`, `${gamification.streakDays}-day streak`],
    sections: [
      {
        heading: "At a glance",
        blocks: [
          keyValues([
            { label: "Average quiz score", value: analytics.totals.averageScore === null ? "—" : `${analytics.totals.averageScore}%` },
            { label: "Accuracy", value: analytics.totals.accuracy === null ? "—" : `${analytics.totals.accuracy}%` },
            { label: "Study time (30 days)", value: `${analytics.totals.focusMinutes} min` },
            { label: "Sessions (30 days)", value: String(analytics.totals.sessions) },
            { label: "Questions answered", value: String(analytics.totals.questions) },
            { label: "Flashcards (30 days)", value: String(analytics.totals.cards) },
            { label: "Concepts tracked", value: String(summary.total) },
            { label: "Average mastery", value: summary.averageMastery === null ? "—" : `${summary.averageMastery}%` },
            { label: "Retrieval strength", value: analytics.retrieval.average === null ? "—" : `${analytics.retrieval.average}%` },
          ]),
        ],
      },
      {
        heading: "Performance",
        blocks: [
          heading("By subject", 3),
          analytics.bySubject.length ? table(["Subject", "Average mastery", "Concepts", "Mastered", "Weak"], analytics.bySubject.map((group) => [group.name, group.averageMastery === null ? "—" : `${group.averageMastery}%`, String(group.concepts), String(group.mastered), String(group.weak)])) : paragraph("No concepts practiced yet.", true),
          heading("By material", 3),
          analytics.byMaterial.length ? table(["Material", "Average mastery", "Concepts", "Mastered", "Weak"], analytics.byMaterial.map((group) => [group.name, group.averageMastery === null ? "—" : `${group.averageMastery}%`, String(group.concepts), String(group.mastered), String(group.weak)])) : paragraph("No concepts practiced yet.", true),
          heading("By difficulty and confidence", 3),
          table(["Group", "Accuracy", "Answered"], [...analytics.byDifficulty, ...analytics.byConfidence].filter((row) => row.answered > 0).map((row) => [row.label, row.accuracy === null ? "—" : `${row.accuracy}%`, String(row.answered)])),
        ],
      },
      {
        heading: "Concept mastery",
        blocks: [
          practiced.length
            ? table(["Concept", "Material", "Status", "Mastery", "Recall strength", "Answers"], practiced.map((row) => [row.concept?.name ?? "Concept", row.concept?.material?.title ?? "", STATUS_LABEL[row.status], `${Math.round(Number(row.mastery))}%`, `${Math.round(Number(row.retrieval_strength))}%`, `${row.correct}/${row.attempts}`]))
            : paragraph("No concepts tracked yet.", true),
          ...(summary.misconceptions.length ? [callout("Possible misconceptions", summary.misconceptions.map((row) => row.concept?.name ?? "concept").join(", "))] : []),
        ],
      },
      {
        heading: "Last 30 days",
        blocks: (() => {
          const active = analytics.days.filter((day) => day.focusMinutes > 0 || day.answered > 0 || day.cards > 0);
          return active.length ? [paragraph(`${active.length} active day${active.length === 1 ? "" : "s"} of ${analytics.days.length}.`, true), table(["Day", "Minutes", "Answered", "Correct", "Cards"], active.map((day) => [day.date, String(day.focusMinutes), String(day.answered), String(day.correct), String(day.cards)]))] : [paragraph("No activity in the last 30 days.", true)];
        })(),
      },
    ],
    footer: footer(),
  };
}

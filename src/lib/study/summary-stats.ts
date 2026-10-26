import { isPlanMethod, isTutorMethod } from "@/lib/study/catalog";

/**
 * Method-specific stats a finished session keeps in its summary (`extra`),
 * rendered the same way by the runners and by the session page after a
 * reload. Client-safe.
 */

export type SummaryStat = { label: string; value: string };

export function extraStatsFor(method: string, extra: Record<string, unknown> | undefined): SummaryStat[] {
  const number = (key: string) => (typeof extra?.[key] === "number" ? (extra[key] as number) : null);
  const stats: SummaryStat[] = [];
  const blocksTotal = number("blocksTotal");
  if (isPlanMethod(method) && blocksTotal) stats.push({ label: "Blocks done", value: `${number("blocksDone") ?? 0}/${blocksTotal}` });
  const preScore = number("preScore");
  const postScore = number("postScore");
  if (method === "pre_testing" && preScore !== null) {
    stats.push({ label: "Pre-test", value: `${Math.round(preScore)}%` });
    stats.push({ label: "Post-test", value: postScore === null ? "—" : `${Math.round(postScore)}%` });
    if (postScore !== null) {
      const change = Math.round(postScore - preScore);
      stats.push({ label: "Improvement", value: `${change > 0 ? "+" : ""}${change} pts` });
    }
  }
  const score = number("score");
  if (isTutorMethod(method) && score !== null) stats.push({ label: method === "teach_back" ? "Teaching score" : "Reasoning score", value: `${Math.round(score)}%` });
  const rounds = number("completedRounds");
  if (method === "pomodoro" && rounds !== null) stats.push({ label: "Rounds", value: String(rounds) });
  const quality = number("averageQuality");
  if (method === "question_generation" && quality !== null) stats.push({ label: "Average quality", value: `${Math.round(quality)}%` });
  return stats;
}

/** What a session's answered/correct/incorrect/accuracy counts mean, when not answers: question generation rates the student's own questions. */
export type CountLabels = { answered: string; correct: string; incorrect: string; accuracy: string };

export function countLabelsFor(method: string): CountLabels | undefined {
  if (method === "question_generation") return { answered: "Questions rated", correct: "Exam-quality", incorrect: "To improve", accuracy: "Exam-quality share" };
  return undefined;
}

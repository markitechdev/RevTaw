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
  // A tutor conversation's score is its accuracy tile (countLabelsFor); its replies are counted here.
  const turns = number("studentTurns");
  if (isTutorMethod(method) && turns !== null) stats.push({ label: "Your replies", value: String(turns) });
  const rounds = number("completedRounds");
  if (method === "pomodoro" && rounds !== null) stats.push({ label: "Rounds", value: String(rounds) });
  // A practice test's questions left blank: they score 0 on the test but aren't counted as answered.
  const unanswered = number("unanswered");
  if (unanswered) stats.push({ label: "Not answered", value: String(unanswered) });
  const quality = number("averageQuality");
  if (method === "question_generation" && quality !== null) stats.push({ label: "Average quality", value: `${Math.round(quality)}%` });
  return stats;
}

/**
 * What a session's answered/correct/incorrect/accuracy tiles mean when they aren't graded answers (null
 * hides a tile): question generation rates the student's own questions, and a tutor conversation is scored
 * as a whole.
 */
export type CountLabels = { answered: string | null; correct: string | null; incorrect: string | null; accuracy: string };

export function countLabelsFor(method: string): CountLabels | undefined {
  if (method === "question_generation") return { answered: "Questions rated", correct: "Exam-quality", incorrect: "To improve", accuracy: "Exam-quality share" };
  if (isTutorMethod(method)) return { answered: null, correct: null, incorrect: null, accuracy: method === "teach_back" ? "Teaching score" : "Reasoning score" };
  return undefined;
}

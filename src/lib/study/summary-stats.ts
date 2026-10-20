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
  const score = number("score");
  if (isTutorMethod(method) && score !== null) stats.push({ label: method === "teach_back" ? "Teaching score" : "Reasoning score", value: `${Math.round(score)}%` });
  const rounds = number("completedRounds");
  if (method === "pomodoro" && rounds !== null) stats.push({ label: "Rounds", value: String(rounds) });
  const quality = number("averageQuality");
  if (method === "question_generation" && quality !== null) stats.push({ label: "Average quality", value: `${Math.round(quality)}%` });
  return stats;
}

import "server-only";

import { getMasterySummary, type MasteryView } from "@/lib/adaptive/engine";
import { hourIn } from "@/lib/planner/dates";
import { getDueToday, getNextExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import type { ResponseLanguage } from "@/lib/preferences/schema";
import { getActivityStats } from "@/lib/study/queries";
import { cardsBubble, examBubble, reviewsBubble, streakBubble, tamariLanguage, weakTopicBubble, type TamariBubble } from "@/lib/tamari/lines";

/** The weakest practiced concept, as a bubble about it (Progress and Home). */
export function weakestTopicBubble(language: ResponseLanguage, weak: MasteryView[]): TamariBubble | null {
  const weakest = [...weak].sort((a, b) => Number(a.mastery) - Number(b.mastery)).find((row) => row.concept);
  return weakest?.concept ? weakTopicBubble(tamariLanguage(language), { id: weakest.concept.id, name: weakest.concept.name, materialId: weakest.concept.material_id }) : null;
}

/**
 * The one thing worth saying on Home, most urgent first: a streak that ends
 * tonight, an exam within three days, today's planned reviews, flashcards due,
 * then the weakest topic. Reads what the Home widgets read (cached per
 * request), after the day's plan adjustment.
 */
export async function homeBubble(language: ResponseLanguage, planning: Promise<unknown>): Promise<TamariBubble | null> {
  await planning;
  const [clock, activity, due, exam, mastery] = await Promise.all([plannerClock(), getActivityStats(), getDueToday(), getNextExam(), getMasterySummary()]);
  const lang = tamariLanguage(language);
  if (activity.streakDays >= 2 && !activity.activeDates.includes(clock.today) && hourIn(new Date(), clock.timezone) >= 18) {
    return streakBubble(lang, activity.streakDays, clock.today);
  }
  if (exam && exam.daysLeft >= 0 && exam.daysLeft <= 3) return examBubble(lang, exam);
  const open = due.tasks.filter((task) => task.status !== "done" && task.status !== "skipped").length;
  if (open > 0) return reviewsBubble(lang, open, clock.today);
  if (due.dueCards > 0) return cardsBubble(lang, due.dueCards, clock.today);
  return weakestTopicBubble(language, mastery.weak);
}

import { routes } from "@/lib/routes";
import type { TamariBubble, TamariLanguage } from "@/lib/tamari/lines";
import { planDoneLine, timesInFilipino } from "@/lib/tamari/plan";

/**
 * What Tamari says on Home (companion doc §3–§4, §16): one line from the
 * student's own data — an exam that is close, a streak that ends tonight, a
 * concept missed again and again, today's reviews, cards due, a finished
 * plan, a real improvement, the weakest topic — each with the next step as
 * its button. Never random: every line is built from numbers RevTaw has.
 * When there is nothing to say, Tamari offers to plan the student's time.
 * Pure and client-safe; lib/tamari/hints.ts picks the line.
 */

type Lines = Record<TamariLanguage, string>;
const say = (lang: TamariLanguage, lines: Lines) => lines[lang];
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const examName = (title: string) => (/\b(exam|test|quiz|midterms?|finals?|prelims?)$/i.test(title.trim()) ? title.trim() : `${title.trim()} exam`);
const start = (lang: TamariLanguage) => say(lang, { taglish: "Start Review", en: "Start Review", fil: "Simulan" });

/** The plan Tamari offers when it has nothing more pressing to say, and the minutes it can plan. */
export const OFFER_MINUTES = [10, 20, 30] as const;

export function offerLine(lang: TamariLanguage): string {
  return say(lang, { taglish: "May 20 minutes ka? Ako na bahala.", en: "Got 20 minutes? Leave it to me.", fil: "May 20 minuto ka? Ako na ang bahala." });
}

export function laterLabel(lang: TamariLanguage): string {
  return say(lang, { taglish: "Later", en: "Later", fil: "Mamaya" });
}

export function examLine(lang: TamariLanguage, exam: { id: string; title: string; daysLeft: number }): TamariBubble {
  const name = examName(exam.title);
  const text =
    exam.daysLeft <= 0
      ? say(lang, { taglish: `${name} mo na today. Isang huling review?`, en: `It's ${name} day. One last review?`, fil: `Araw na ng ${name} mo. Isang huling review?` })
      : exam.daysLeft === 1
        ? say(lang, { taglish: `Bukas na ang ${name} mo. Review tayo?`, en: `Your ${name} is tomorrow. Review together?`, fil: `Bukas na ang ${name} mo. Mag-review tayo?` })
        : say(lang, { taglish: `${exam.daysLeft} days na lang bago ${name} mo.`, en: `${exam.daysLeft} days left before your ${name}.`, fil: `${exam.daysLeft} araw na lang bago ang ${name} mo.` });
  return { id: `exam:${exam.id}:${exam.daysLeft}`, state: "exam", text, action: { label: start(lang), kind: "plan", minutes: 20 } };
}

export function streakLine(lang: TamariLanguage, streakDays: number, today: string): TamariBubble {
  return {
    id: `streak:${today}`,
    state: "idle",
    text: say(lang, {
      taglish: `${streakDays}-day streak. Sayang pag pinutol mo ngayon.`,
      en: `${streakDays}-day streak. Don't let it end today.`,
      fil: `${streakDays}-araw na streak. Sayang kung mapuputol ngayon.`,
    }),
    action: { label: say(lang, { taglish: "10-min review", en: "10-minute review", fil: "10-minutong review" }), kind: "plan", minutes: 10 },
  };
}

/** The same concept missed again and again (three times or more, with one still open). */
export function repeatedLine(lang: TamariLanguage, concept: { id: string; name: string; count: number; materialId: string | null }): TamariBubble {
  return {
    id: `repeat:${concept.id}:${concept.count}`,
    state: "serious",
    text: say(lang, {
      taglish: `${timesInFilipino(concept.count)} na nating namiss ang ${concept.name}. Tara, explain mo sakin.`,
      en: `We've missed ${concept.name} ${concept.count} times now. Explain it to me?`,
      fil: `${timesInFilipino(concept.count)} na nating namali ang ${concept.name}. Tara, ipaliwanag mo sa akin.`,
    }),
    action: {
      label: say(lang, { taglish: "Sige, explain ko", en: "Explain it", fil: "Sige" }),
      ...(concept.materialId
        ? { kind: "session" as const, method: "feynman" as const, materialId: concept.materialId, minutes: 10, concepts: [concept.name] }
        : { kind: "ask" as const, prompt: `I keep getting ${concept.name} wrong. Let me explain it to you, then tell me what I'm missing.` }),
    },
  };
}

/** Today's planned reviews, starting with the first one ("Unahin natin …?"). */
export function reviewsLine(lang: TamariLanguage, due: { count: number; taskId: string; topic: string | null }, today: string): TamariBubble {
  const first = due.topic
    ? say(lang, { taglish: ` Unahin natin ${due.topic}?`, en: ` Start with ${due.topic}?`, fil: ` Unahin natin ang ${due.topic}?` })
    : "";
  return {
    id: `due:${today}:${due.count}`,
    state: "idle",
    text: say(lang, { taglish: `May ${plural(due.count, "review")} ka today.`, en: `You have ${plural(due.count, "review")} today.`, fil: `May ${due.count} review ka ngayong araw.` }) + first,
    action: { label: start(lang), kind: "task", taskId: due.taskId },
  };
}

export function cardsLine(lang: TamariLanguage, count: number, today: string): TamariBubble {
  return {
    id: `cards:${today}:${count}`,
    state: "idle",
    text: say(lang, {
      taglish: `May ${plural(count, "card")} kang due today.`,
      en: `${plural(count, "flashcard")} ${count === 1 ? "is" : "are"} due today.`,
      fil: `May ${count} card na dapat i-review ngayon.`,
    }),
    action: { label: start(lang), kind: "open", href: `${routes.flashcards}/review` },
  };
}

/** A quiz that went clearly better than the one before it on the same material. */
export function improvementLine(lang: TamariLanguage, quiz: { attemptId: string; from: number; to: number; materialId: string | null }): TamariBubble {
  return {
    id: `better:${quiz.attemptId}`,
    state: "confident",
    text: `Bitaw! From ${quiz.from}% to ${quiz.to}%.`,
    action: {
      label: say(lang, { taglish: "Isa pa?", en: "One more?", fil: "Isa pa?" }),
      ...(quiz.materialId ? { kind: "session" as const, method: "practice_testing" as const, materialId: quiz.materialId, minutes: 10 } : { kind: "open" as const, href: routes.quiz }),
    },
  };
}

/** A plan finished today, and how it went. */
export function planFinishedLine(lang: TamariLanguage, plan: { sessionId: string; correct: number; answered: number; firstAccuracy: number | null; lastAccuracy: number | null }): TamariBubble {
  const line = planDoneLine(lang, plan);
  return {
    id: `done:${plan.sessionId}`,
    state: line.state,
    text: line.text,
    action: { label: say(lang, { taglish: "Tingnan", en: "See how it went", fil: "Tingnan" }), kind: "open", href: `${routes.study}/${plan.sessionId}` },
  };
}

/** A study goal reached (today's minutes, this week's cards, a mastery target). */
export function goalLine(lang: TamariLanguage, goal: { id: string; label: string }): TamariBubble {
  return {
    id: `goal:${goal.id}`,
    state: "confident",
    text: say(lang, { taglish: `Bitaw! Naabot mo na: ${goal.label}.`, en: `Bitaw! Goal reached: ${goal.label}.`, fil: `Bitaw! Naabot mo na ang layunin: ${goal.label}.` }),
    action: { label: say(lang, { taglish: "Tingnan", en: "See your goals", fil: "Tingnan" }), kind: "open", href: routes.planner },
  };
}

export function weakestLine(lang: TamariLanguage, concept: { id: string; name: string; materialId: string | null }): TamariBubble {
  return {
    id: `weakest:${concept.id}`,
    state: "idle",
    text: say(lang, { taglish: `${concept.name} pa rin pinakamahinang topic mo.`, en: `${concept.name} is still your weakest topic.`, fil: `${concept.name} pa rin ang pinakamahina mong paksa.` }),
    action: {
      label: say(lang, { taglish: "Balikan natin", en: "Work on it", fil: "Balikan natin" }),
      ...(concept.materialId
        ? { kind: "session" as const, method: "active_recall" as const, materialId: concept.materialId, minutes: 10, concepts: [concept.name] }
        : { kind: "ask" as const, prompt: `Help me review ${concept.name}: a short explanation, then quiz me.` }),
    },
  };
}

/** "Later": which lines the student put off today, kept in a small cookie (cookie-safe characters only) so Home renders without them. */
export const LATER_COOKIE = "revtaw-tamari-later";

export function parseLater(value: string | undefined, today: string): string[] {
  if (!value || value.length > 1200) return [];
  const [day, ids] = value.split("~");
  if (day !== today || !ids) return [];
  return ids.split("!").filter((id) => /^[a-z]+:[\w:.-]{1,120}$/i.test(id)).slice(0, 10);
}

export function formatLater(today: string, ids: string[]): string {
  return `${today}~${[...new Set(ids)].slice(-10).join("!")}`;
}

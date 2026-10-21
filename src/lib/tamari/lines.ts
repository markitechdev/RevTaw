import type { ResponseLanguage } from "@/lib/preferences/schema";
import { routes } from "@/lib/routes";
import type { TamariState } from "@/lib/tamari/states";

/**
 * What Tamari says on its own (mascot doc §11–§12): short, a smart study
 * buddy rather than a teacher, in the student's response language — Taglish
 * when they have not chosen (it is RevTaw's voice), English for a language
 * Tamari's lines are not written in. Client-safe and pure.
 */

export type TamariLanguage = "en" | "fil" | "taglish";

export function tamariLanguage(language: ResponseLanguage): TamariLanguage {
  if (language === "en" || language === "other") return "en";
  if (language === "fil") return "fil";
  return "taglish";
}

/** A speech bubble: shown at most once per session (by `id`), a few per session at most. */
export type TamariBubble = {
  id: string;
  text: string;
  /** How Tamari looks while saying it. */
  state: TamariState;
  /** Optional next step: a page to open, or a question to ask Tamari (with the page's context, or grounded in `materialId`). */
  action?: { label: string; href?: string; prompt?: string; materialId?: string | null };
};

type Lines = Record<TamariLanguage, string>;
const say = (lang: TamariLanguage, lines: Lines) => lines[lang];
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** "Calculus Midterm" → "Calculus Midterm exam"; "Biology exam" stays as it is. */
const examName = (title: string) => (/\b(exam|test|quiz|midterms?|finals?|prelims?)$/i.test(title.trim()) ? title.trim() : `${title.trim()} exam`);

export function streakBubble(lang: TamariLanguage, streakDays: number, today: string): TamariBubble {
  return {
    id: `streak:${today}`,
    state: "serious",
    text: say(lang, {
      taglish: `Baka maputol ang ${streakDays}-day streak mo! Isang review lang.`,
      en: `Your ${streakDays}-day streak ends tonight. One quick review?`,
      fil: `Mapuputol na ang ${streakDays}-araw na streak mo! Isang review lang.`,
    }),
    action: { label: say(lang, { taglish: "Review na", en: "Review now", fil: "Mag-review" }), href: `${routes.study}?method=rapid_review` },
  };
}

export function examBubble(lang: TamariLanguage, exam: { id: string; title: string; daysLeft: number }): TamariBubble {
  const name = examName(exam.title);
  const text =
    exam.daysLeft <= 0
      ? say(lang, { taglish: `${name} mo na today! Kaya mo 'yan.`, en: `It's ${name} day. You've got this!`, fil: `Araw na ng ${name} mo! Kaya mo 'yan.` })
      : exam.daysLeft === 1
        ? say(lang, { taglish: `Bukas na ang ${name} mo. Review tayo?`, en: `Your ${name} is tomorrow. Quick review?`, fil: `Bukas na ang ${name} mo. Mag-review tayo?` })
        : say(lang, {
            taglish: `${exam.daysLeft} days na lang before your ${name}.`,
            en: `${exam.daysLeft} days left before your ${name}.`,
            fil: `${exam.daysLeft} araw na lang bago ang ${name} mo.`,
          });
  return {
    id: `exam:${exam.id}:${exam.daysLeft}`,
    state: exam.daysLeft <= 1 ? "serious" : "idle",
    text,
    action: { label: say(lang, { taglish: "Tingnan ang plan", en: "Open the plan", fil: "Tingnan ang plano" }), href: `${routes.planner}/${exam.id}` },
  };
}

export function reviewsBubble(lang: TamariLanguage, count: number, today: string): TamariBubble {
  return {
    id: `due:${today}`,
    state: "idle",
    text: say(lang, {
      taglish: `May ${plural(count, "review")} ka today.`,
      en: `You have ${plural(count, "review")} today.`,
      fil: `May ${count} review ka ngayong araw.`,
    }),
  };
}

export function cardsBubble(lang: TamariLanguage, count: number, today: string): TamariBubble {
  return {
    id: `cards:${today}`,
    state: "idle",
    text: say(lang, {
      taglish: `May ${plural(count, "flashcard")} kang due today.`,
      en: `${plural(count, "flashcard")} ${count === 1 ? "is" : "are"} due today.`,
      fil: `May ${count} flashcard na dapat i-review ngayon.`,
    }),
    action: { label: say(lang, { taglish: "Tara!", en: "Review cards", fil: "Tara!" }), href: `${routes.flashcards}/review` },
  };
}

export function weakTopicBubble(lang: TamariLanguage, concept: { id: string; name: string; materialId: string | null }): TamariBubble {
  return {
    id: `weak:${concept.id}`,
    state: "idle",
    text: say(lang, { taglish: `Balikan natin ang ${concept.name}?`, en: `Shall we go over ${concept.name} again?`, fil: `Balikan natin ang ${concept.name}?` }),
    action: {
      label: say(lang, { taglish: "Sige!", en: "Let's do it", fil: "Sige!" }),
      prompt: `Help me review ${concept.name}: a short explanation, then quiz me.`,
      materialId: concept.materialId,
    },
  };
}

/** After a quiz: a cheer, a nudge to go over the misses, or a serious "we have work to do". */
export function quizBubble(lang: TamariLanguage, attempt: { id: string; correct: number; total: number; previousPercent: number | null }): TamariBubble | null {
  if (attempt.total <= 0) return null;
  const percent = Math.round((attempt.correct / attempt.total) * 100);
  const missesAction = { label: say(lang, { taglish: "Balikan natin", en: "Go over them", fil: "Balikan natin" }), prompt: "Which questions did I get wrong, and why?" };
  if (attempt.previousPercent !== null && percent >= attempt.previousPercent + 5) {
    return { id: `quiz:${attempt.id}`, state: "celebrating", text: `Bitaw! From ${attempt.previousPercent}% to ${percent}%.` };
  }
  if (percent >= 80) return { id: `quiz:${attempt.id}`, state: "celebrating", text: `Bitaw! ${attempt.correct}/${attempt.total}.` };
  if (percent >= 50) {
    return {
      id: `quiz:${attempt.id}`,
      state: "idle",
      text: say(lang, {
        taglish: `${attempt.correct}/${attempt.total}. Ayos! Balikan natin ang mga mali?`,
        en: `${attempt.correct}/${attempt.total}. Not bad! Go over the misses?`,
        fil: `${attempt.correct}/${attempt.total}. Ayos! Balikan natin ang mga mali?`,
      }),
      action: missesAction,
    };
  }
  return {
    id: `quiz:${attempt.id}`,
    state: "serious",
    text: say(lang, {
      taglish: "Mukhang may kailangan pa tayong balikan dito.",
      en: "Looks like we have some reviewing to do here.",
      fil: "Mukhang may kailangan pa tayong balikan dito.",
    }),
    action: missesAction,
  };
}

/** When the student only says "Tamari". */
export function hereLine(lang: TamariLanguage): string {
  return say(lang, { taglish: "Nandito ako! Ask me anything.", en: "I'm here! Ask me anything.", fil: "Nandito ako! Magtanong ka lang." });
}

/** After a long nap, when the student comes back. */
export function napBubble(lang: TamariLanguage): TamariBubble {
  return {
    id: "nap",
    state: "idle",
    text: say(lang, { taglish: "Review tayo?", en: "Back for a quick review?", fil: "Mag-review tayo?" }),
    action: { label: say(lang, { taglish: "Tara!", en: "Let's go", fil: "Tara!" }), href: routes.study },
  };
}

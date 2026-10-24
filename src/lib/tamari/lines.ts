import type { ResponseLanguage } from "@/lib/preferences/options";
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

/** Methods Tamari can start straight from a line (no builder in between). */
export type TamariSessionMethod = "active_recall" | "feynman" | "practice_testing" | "error_review" | "rapid_review";

/**
 * What a line's button does: open a page, ask Tamari something (with the
 * page's context, or grounded in `materialId`), start today's planner task,
 * start a session of one method, or start Tamari's time-boxed plan.
 */
export type TamariMove =
  | { kind: "open"; href: string }
  | { kind: "ask"; prompt: string; materialId?: string | null }
  | { kind: "task"; taskId: string }
  | { kind: "session"; method: TamariSessionMethod; materialId: string | null; minutes: number; focus?: string | null; concepts?: string[] }
  | { kind: "plan"; minutes: number; materialId?: string | null };

export type TamariAction = { label: string } & TamariMove;

/** Something Tamari says: shown at most once per session (by `id`), a few per session at most. */
export type TamariBubble = {
  id: string;
  text: string;
  /** How Tamari looks while saying it. */
  state: TamariState;
  /** Optional next step. */
  action?: TamariAction;
};

type Lines = Record<TamariLanguage, string>;
const say = (lang: TamariLanguage, lines: Lines) => lines[lang];

const STATUS: Record<TamariState, Lines> = {
  idle: { taglish: "Nandito lang ako.", en: "I'm here.", fil: "Nandito lang ako." },
  learning: { taglish: "Sandali, tinitingnan ko notes mo.", en: "One sec, I'm going through your notes.", fil: "Sandali, tinitingnan ko ang notes mo." },
  thinking: { taglish: "Iniisip ko…", en: "Thinking…", fil: "Iniisip ko…" },
  listening: { taglish: "Nakikinig ako…", en: "Listening…", fil: "Nakikinig ako…" },
  speaking: { taglish: "Nagsasalita ako…", en: "Talking…", fil: "Nagsasalita ako…" },
  serious: { taglish: "Seryoso na tayo.", en: "Let's fix this.", fil: "Seryoso na tayo." },
  exam: { taglish: "Exam mode na.", en: "Exam mode.", fil: "Exam mode na." },
  confident: { taglish: "Bitaw!", en: "Nice work!", fil: "Bitaw!" },
  sleepy: { taglish: "Naiidlip…", en: "Napping…", fil: "Naiidlip…" },
};

export function tamariStatus(state: TamariState, lang: TamariLanguage): string {
  return STATUS[state][lang];
}

/** While a recording is turned into text on the server (browsers without Web Speech). */
export function transcribingLine(lang: TamariLanguage): string {
  return say(lang, { taglish: "Sinusulat ko ang sinabi mo…", en: "Writing down what you said…", fil: "Isinusulat ko ang sinabi mo…" });
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
    text: say(lang, { taglish: "Uy, buhay ka pa pala. Review?", en: "Oh hey, you're back. Review?", fil: "Uy, nandiyan ka pa pala. Review tayo?" }),
    action: { label: say(lang, { taglish: "Tara!", en: "Let's go", fil: "Tara!" }), kind: "plan", minutes: 10 },
  };
}

/* ------------------------------------------------------------------ */
/* Tamari's replies to what the student asked it to do                 */
/* ------------------------------------------------------------------ */

export const commandLines = {
  plan: (lang: TamariLanguage, minutes: number) =>
    say(lang, { taglish: `Sige! Ako na bahala sa ${minutes} minutes mo…`, en: `On it — planning your ${minutes} minutes…`, fil: `Sige! Ako na ang bahala sa ${minutes} minuto mo…` }),
  quiz: (lang: TamariLanguage, topic: string | null) =>
    say(lang, {
      taglish: `Sige! Gagawa ako ng quiz${topic ? ` sa ${topic}` : ""}…`,
      en: `On it — writing a quiz${topic ? ` on ${topic}` : ""}…`,
      fil: `Sige! Gagawa ako ng quiz${topic ? ` tungkol sa ${topic}` : ""}…`,
    }),
  quizReady: (lang: TamariLanguage) => say(lang, { taglish: "Ready na. Ready ka?", en: "It's ready. Ready?", fil: "Handa na. Handa ka na?" }),
  quizNeedsMaterial: (lang: TamariLanguage) =>
    say(lang, { taglish: "Saang material? I-attach mo muna, tapos sabihin mo ulit.", en: "Which material? Attach one first, then ask me again.", fil: "Saang material? I-attach mo muna, tapos sabihin mo ulit." }),
  exam: (lang: TamariLanguage, day: string) =>
    say(lang, {
      taglish: `Sige! I-set natin ang exam mo sa ${day}, tapos gagawa ako ng review plan.`,
      en: `Let's add your exam on ${day} — then I'll build its review plan.`,
      fil: `Sige! Ilagay natin ang exam mo sa ${day}, tapos gagawa ako ng review plan.`,
    }),
  moveAsk: (lang: TamariLanguage, title: string, day: string) => say(lang, { taglish: `Ilipat ang “${title}” sa ${day}?`, en: `Move “${title}” to ${day}?`, fil: `Ilipat ang “${title}” sa ${day}?` }),
  moveDone: (lang: TamariLanguage, day: string) => say(lang, { taglish: `Done! Nasa ${day} na siya.`, en: `Done — it's on ${day} now.`, fil: `Ayan! Nasa ${day} na.` }),
  moveNeedsTask: (lang: TamariLanguage) =>
    say(lang, { taglish: "Alin? Pumili ka muna ng task sa planner, tapos sabihin mo ulit.", en: "Which one? Pick a task in the planner first, then ask me again.", fil: "Alin? Pumili ka muna ng task sa planner, tapos sabihin mo ulit." }),
  nothingMoved: (lang: TamariLanguage) => say(lang, { taglish: "Okay, hindi ko ginalaw.", en: "Okay, I left it where it is.", fil: "Sige, hindi ko ginalaw." }),
  /** Said in the new language, so the switch is heard at once ("auto" answers in the current one). */
  language: (lang: TamariLanguage, next: "auto" | TamariLanguage) =>
    next === "auto"
      ? say(lang, {
          taglish: "Sige! Kung anong language mo, 'yun din gagamitin ko.",
          en: "Okay — I'll answer in whatever language you write in.",
          fil: "Sige! Kung anong wika ang gamit mo, iyon din ang gagamitin ko.",
        })
      : say(next, {
          taglish: "Sige, Taglish na tayo from now on.",
          en: "Okay, I'll answer in English from now on.",
          fil: "Sige, sa Filipino na ako sasagot mula ngayon.",
        }),
};

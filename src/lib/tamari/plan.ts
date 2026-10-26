import type { SmartBlock } from "@/lib/adaptive/smart";
import { methodName } from "@/lib/study/catalog";
import type { SessionSummary } from "@/lib/study/sessions";
import type { TamariLanguage } from "@/lib/tamari/lines";

/**
 * Tamari's time-boxed plan (companion doc §5–§6): "20 minutes lang ako.
 * Bahala ka na." becomes a short run of blocks sized to the minutes, built
 * from what the student's data says — fading concepts first, then the
 * highest-priority topics as a quiz (when concepts never studied come first,
 * the method the rule table picks for them, next to the quiz while some
 * topics are weak), one concept to explain, the mistake notebook and a last
 * retest. This file only decides the blocks;
 * lib/adaptive/smart.ts ranks the concepts (research doc §10–§11) and saves
 * the plan. Pure and client-safe.
 */

export type TamariPlanInput = {
  minutes: number;
  lang: TamariLanguage;
  /** The material the plan works on (an upcoming exam's, the one the weak concepts come from, or the one asked for). */
  material: { id: string; title: string } | null;
  /** The exam the plan is for, when one is close. */
  exam: { title: string; daysLeft: number } | null;
  /** Concepts due for review (fading), most faded first. */
  overdue: string[];
  /** Practiced concepts to work on, highest priority first (weakness, fading, the exam's scope). */
  weak: string[];
  /** The ones among `weak` that are weak topics (adaptive/mastery isWeakTopic), for a "Weak Topic Quiz"; all of them when left out. */
  weakTopics?: string[];
  /** Concepts never studied that outrank the practiced ones, and the method the rule table picks for them. */
  fresh?: { names: string[]; method: SmartBlock["method"] } | null;
  /** A concept answered confidently but wrongly. */
  misconception: string | null;
  /** The concept missed most often lately. */
  repeated: { name: string; count: number } | null;
  /**
   * Mistakes the plan's Mistake Review retests, the material's (or all of them without one): the open ones
   * missed before today, which a right retest clears now (today's count only from tomorrow).
   */
  openMistakes: number;
  dueCards: number;
};

export type TamariPlanDraft = {
  blocks: SmartBlock[];
  /** Tamari's line at the top of the plan. */
  intro: string;
  title: string;
};

type Lines = Record<TamariLanguage, string>;
const say = (lang: TamariLanguage, lines: Lines) => lines[lang];
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const listFil = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} at ${names[names.length - 1]}`);
const examName = (title: string) => (/\b(exam|test|quiz|midterms?|finals?|prelims?)$/i.test(title.trim()) ? title.trim() : `${title.trim()} exam`);

/** "Tatlong beses", "Apat na beses": how many times, the Filipino way (3–10), digits beyond. */
export function timesInFilipino(count: number): string {
  const words: Record<number, string> = { 2: "Dalawang", 3: "Tatlong", 4: "Apat na", 5: "Limang", 6: "Anim na", 7: "Pitong", 8: "Walong", 9: "Siyam na", 10: "Sampung" };
  return words[count] ? `${words[count]} beses` : `${count} beses`;
}

type Slot = { key: string; share: number; min: number; block: (minutes: number) => SmartBlock };

/** Most blocks a plan of this length gets: short plans stay simple. */
function maxBlocks(minutes: number): number {
  if (minutes < 15) return 3;
  if (minutes < 25) return 5;
  if (minutes < 45) return 6;
  return 7;
}

/** Splits `total` minutes over the slots: each gets its minimum, the rest goes by share (largest remainder, so it adds up exactly). */
export function allocateMinutes(total: number, slots: ReadonlyArray<{ share: number; min: number }>): number[] {
  const base = slots.map((slot) => slot.min);
  const rest = total - base.reduce((sum, value) => sum + value, 0);
  if (rest <= 0) return base;
  const shareSum = slots.reduce((sum, slot) => sum + slot.share, 0) || 1;
  const want = slots.map((slot, index) => Math.max(0, (total * slot.share) / shareSum - base[index]));
  const wantSum = want.reduce((sum, value) => sum + value, 0);
  const extra = want.map((value) => (wantSum > 0 ? (rest * value) / wantSum : rest / slots.length));
  const floors = extra.map((value) => Math.floor(value));
  let left = rest - floors.reduce((sum, value) => sum + value, 0);
  const order = extra.map((value, index) => ({ index, fraction: value - floors[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return base.map((value, index) => value + floors[index]);
}

const questionsFor = (minutes: number) => Math.max(3, Math.min(20, Math.round(minutes * 1.2)));

/** Tamari's reason for starting concepts the student has never studied with the method the rules picked. */
function freshLine(lang: TamariLanguage, fresh: { names: string[]; method: SmartBlock["method"] }): string {
  const names = fresh.names;
  const isAre = names.length === 1 ? "is" : "are";
  switch (fresh.method) {
    case "chunking":
      return say(lang, {
        taglish: `Bago pa sa'yo ang ${list(names)}. Paisa-isa muna, tapos ilang madaling tanong sa bawat isa.`,
        en: `${list(names)} ${isAre} new to you. Small pieces first, then a few easy questions on each.`,
        fil: `Bago pa sa iyo ang ${listFil(names)}. Paisa-isa muna, saka ilang madaling tanong sa bawat isa.`,
      });
    case "sq3r":
      return say(lang, {
        taglish: `Bago pa sa'yo ang ${list(names)}. Survey, tanong, basa, recite, review — step by step.`,
        en: `${list(names)} ${isAre} new to you. Survey, question, read, recite, review — step by step.`,
        fil: `Bago pa sa iyo ang ${listFil(names)}. Suriin, magtanong, basahin, bigkasin, balikan — hakbang-hakbang.`,
      });
    case "blurting":
      return say(lang, {
        taglish: `Bago pa sa'yo ang ${list(names)}. Basahin mo, tapos isulat lahat ng naaalala mo.`,
        en: `${list(names)} ${isAre} new to you. Read it, then write down everything you remember.`,
        fil: `Bago pa sa iyo ang ${listFil(names)}. Basahin mo, saka isulat ang lahat ng naaalala mo.`,
      });
    default:
      return say(lang, {
        taglish: `Bago pa sa'yo ang ${list(names)}. ${methodName(fresh.method)} muna.`,
        en: `${list(names)} ${isAre} new to you. ${methodName(fresh.method)} first.`,
        fil: `Bago pa sa iyo ang ${listFil(names)}. ${methodName(fresh.method)} muna.`,
      });
  }
}

export function planTamariBlocks(input: TamariPlanInput): TamariPlanDraft {
  const { lang } = input;
  const total = Math.max(5, Math.min(240, Math.round(input.minutes)));
  const material = input.material;
  const weak = input.weak.slice(0, 4);
  const overdue = input.overdue.slice(0, 4);
  const pending = { status: "pending" as const, childSessionId: null };
  const slots: Slot[] = [];
  let reserved = 0;
  const head: SmartBlock[] = [];

  if (material) {
    // Longer plans open with a blurt: it shows what stuck before the drills.
    if (total >= 45) {
      reserved = 10;
      head.push({
        key: "blurt",
        method: "blurting",
        label: "Blurting",
        minutes: 10,
        reason: say(lang, {
          taglish: "Isulat mo muna lahat ng naaalala mo. Doon tayo magsisimula.",
          en: "First, write down everything you remember. We'll start from there.",
          fil: "Isulat mo muna ang lahat ng naaalala mo. Doon tayo magsisimula.",
        }),
        concepts: [],
        ...pending,
      });
    }

    const recallTargets = overdue.length > 0 ? overdue : weak;
    slots.push({
      key: "recall",
      share: 0.15,
      min: 2,
      block: (minutes) => ({
        key: "recall",
        method: "active_recall",
        label: "Active Recall",
        minutes,
        reason:
          overdue.length > 0
            ? say(lang, {
                taglish: `${list(overdue)} — malapit nang makalimutan. Balikan muna natin.`,
                en: `${list(overdue)} ${overdue.length === 1 ? "is" : "are"} fading. A quick recall before ${overdue.length === 1 ? "it slips" : "they slip"}.`,
                fil: `${listFil(overdue)} — malapit nang makalimutan. Balikan muna natin.`,
              })
            : recallTargets.length > 0
              ? say(lang, {
                  taglish: `Warm-up: alalahanin mo ang ${list(recallTargets)} nang walang sinisilip.`,
                  en: `Warm-up: pull ${list(recallTargets)} from memory, no peeking.`,
                  fil: `Warm-up: alalahanin mo ang ${listFil(recallTargets)} nang walang sinisilip.`,
                })
              : say(lang, {
                  taglish: `Warm-up: ilang tanong mula sa ${material.title}, sagot mula sa memory.`,
                  en: `Warm-up: a few questions on ${material.title}, answered from memory.`,
                  fil: `Warm-up: ilang tanong mula sa ${material.title}, sagot mula sa alaala.`,
                }),
        concepts: recallTargets,
        ...pending,
      }),
    });

    const fresh = input.fresh && input.fresh.names.length > 0 ? { names: input.fresh.names.slice(0, 4), method: input.fresh.method } : null;
    // The quiz names as weak only the weak topics among them; the rest are what's next to practice.
    const listed = input.weakTopics;
    const weakNames = listed ? weak.filter((name) => listed.includes(name)) : weak;
    const nextNames = weak.filter((name) => !weakNames.includes(name));
    const weakTopics = weakNames.length > 0;
    // Concepts never studied come first: the rule table's method for them takes the quiz's place, unless
    // some topics are weak, which keep their quiz next to it (the two share its time).
    const learnAndQuiz = fresh !== null && weakTopics;
    if (fresh) {
      slots.push({
        key: "learn",
        share: learnAndQuiz ? 0.25 : 0.35,
        min: 3,
        block: (minutes) => ({
          key: "learn",
          method: fresh.method,
          label: methodName(fresh.method),
          minutes,
          reason: freshLine(lang, fresh),
          concepts: fresh.names,
          ...pending,
        }),
      });
    }
    if (!fresh || learnAndQuiz) {
      slots.push({
        key: "quiz",
        share: learnAndQuiz ? 0.25 : 0.35,
        min: 3,
        block: (minutes) => ({
          key: "quiz",
          method: "practice_testing",
          label: weakTopics ? "Weak Topic Quiz" : "Quiz",
          minutes,
          reason: weakTopics
            ? say(lang, {
                taglish: `Quiz sa ${weakNames.length === 1 ? "" : "mga "}mahina mong topic: ${list(weakNames)}${nextNames.length ? `, pati ang susunod na dapat i-practice: ${list(nextNames)}` : ""}.`,
                en: `A quiz on your weak topic${weakNames.length === 1 ? "" : "s"}: ${list(weakNames)}${nextNames.length ? `, plus what's next to practice: ${list(nextNames)}` : ""}.`,
                fil: `Quiz sa ${weakNames.length === 1 ? "" : "mga "}mahina mong paksa: ${listFil(weakNames)}${nextNames.length ? `, pati ang susunod na dapat sanayin: ${listFil(nextNames)}` : ""}.`,
              })
            : weak.length > 0
              ? say(lang, {
                  taglish: `Quiz sa ${list(weak)} — ito ang susunod na dapat i-practice.`,
                  en: `A quiz on ${list(weak)}: what's next to practice.`,
                  fil: `Quiz sa ${listFil(weak)} — ito ang susunod na dapat sanayin.`,
                })
              : say(lang, {
                  taglish: `Quiz sa ${material.title}, para makita natin kung saan ka mahina.`,
                  en: `A quiz on ${material.title}, to find where the gaps are.`,
                  fil: `Quiz sa ${material.title}, para makita natin kung saan ka mahina.`,
                }),
          concepts: weak,
          questionCount: questionsFor(minutes),
          focus: weak.length > 0 ? weak.join(", ") : null,
          ...pending,
        }),
      });
    }

    const explain = input.misconception ?? input.repeated?.name ?? weak[0] ?? null;
    if (explain) {
      slots.push({
        key: "feynman",
        share: 0.25,
        min: 3,
        block: (minutes) => ({
          key: "feynman",
          method: "feynman",
          label: "Feynman",
          minutes,
          reason:
            input.repeated && input.repeated.name === explain && input.repeated.count >= 3
              ? say(lang, {
                  taglish: `${timesInFilipino(input.repeated.count)} na nating namiss ang ${explain}. Tara, explain mo sakin.`,
                  en: `We've missed ${explain} ${input.repeated.count} times. Explain it to me like I'm a beginner.`,
                  fil: `${timesInFilipino(input.repeated.count)} na nating namali ang ${explain}. Tara, ipaliwanag mo sa akin.`,
                })
              : input.misconception === explain
                ? say(lang, {
                    taglish: `Sigurado ka sa ${explain} pero mali ang sagot. Explain mo sakin, parang beginner ako.`,
                    en: `You were sure about ${explain}, but the answer was off. Explain it to me like I'm a beginner.`,
                    fil: `Sigurado ka sa ${explain} pero mali ang sagot. Ipaliwanag mo sa akin na parang baguhan ako.`,
                  })
                : say(lang, {
                    taglish: `Explain mo sakin ang ${explain}, parang beginner ako. Doon lumalabas ang butas.`,
                    en: `Explain ${explain} to me like I'm a beginner. That's where the gaps show.`,
                    fil: `Ipaliwanag mo sa akin ang ${explain} na parang baguhan ako. Doon lumalabas ang kulang.`,
                  }),
          concepts: [explain],
          ...pending,
        }),
      });
    }

    if (input.openMistakes > 0) {
      slots.push({
        key: "mistakes",
        share: 0.15,
        min: 2,
        block: (minutes) => ({
          key: "mistakes",
          method: "error_review",
          label: "Mistake Review",
          minutes,
          reason: say(lang, {
            taglish: `${input.openMistakes} mali mula sa ${material.title} sa notebook mo. Balikan natin para hindi na maulit.`,
            en: `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} from ${material.title} in your notebook. Let's make sure ${input.openMistakes === 1 ? "it doesn't" : "they don't"} come back.`,
            fil: `${input.openMistakes} mali mula sa ${material.title} sa notebook mo. Balikan natin para hindi na maulit.`,
          }),
          concepts: [],
          ...pending,
        }),
      });
    }

    if (total >= 40 && input.dueCards > 0) {
      slots.push({
        key: "cards",
        share: 0.15,
        min: 3,
        block: (minutes) => ({
          key: "cards",
          method: "spaced_repetition",
          label: "Due Flashcards",
          minutes,
          reason: say(lang, {
            taglish: `${input.dueCards} cards ang due. Ngayon na, habang sakto ang timing.`,
            en: `${input.dueCards} card${input.dueCards === 1 ? " is" : "s are"} due. Right on time is what makes them stick.`,
            fil: `${input.dueCards} card ang dapat i-review ngayon. Sakto ang oras para tumatak.`,
          }),
          concepts: [],
          ...pending,
        }),
      });
    }

    slots.push({
      key: "retest",
      share: 0.1,
      min: 2,
      block: (minutes) => ({
        key: "retest",
        method: "practice_testing",
        label: "Retest",
        minutes,
        reason: say(lang, {
          taglish: "Huling check: ilang tanong ulit sa mga namiss mo kanina.",
          en: "Last check: a few questions again on what you missed today.",
          fil: "Huling check: ilang tanong ulit sa mga namali mo kanina.",
        }),
        concepts: [],
        questionCount: minutes >= 4 ? questionsFor(minutes) : 3,
        focus: weak.length > 0 ? weak.join(", ") : fresh ? fresh.names.join(", ") : null,
        ...pending,
      }),
    });

    // Too many blocks, or not enough minutes for each one's minimum: drop the least essential first (with
    // a learn block and a quiz, the quiz on weak topics stays longest).
    const dropOrder = ["feynman", "retest", "cards", "mistakes", "recall", ...(learnAndQuiz ? ["learn"] : [])];
    const fits = () => head.length + slots.length <= maxBlocks(total) && slots.reduce((sum, slot) => sum + slot.min, 0) <= total - reserved;
    for (const key of dropOrder) {
      if (fits()) break;
      const index = slots.findIndex((slot) => slot.key === key);
      if (index !== -1) slots.splice(index, 1);
    }
  } else {
    // No material to work on: the notebook and due cards, else a plain focus block.
    if (input.openMistakes > 0) {
      slots.push({
        key: "mistakes",
        share: 0.5,
        min: 2,
        block: (minutes) => ({
          key: "mistakes",
          method: "error_review",
          label: "Mistake Review",
          minutes,
          reason: say(lang, {
            taglish: `${input.openMistakes} mali sa notebook mo. Balikan natin para hindi na maulit.`,
            en: `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} in your notebook. Let's clear them.`,
            fil: `${input.openMistakes} mali sa notebook mo. Balikan natin para hindi na maulit.`,
          }),
          concepts: [],
          ...pending,
        }),
      });
    }
    if (input.dueCards > 0) {
      slots.push({
        key: "cards",
        share: 0.5,
        min: 2,
        block: (minutes) => ({
          key: "cards",
          method: "spaced_repetition",
          label: "Due Flashcards",
          minutes,
          reason: say(lang, {
            taglish: `${input.dueCards} cards ang due. Ngayon na, habang sakto ang timing.`,
            en: `${input.dueCards} card${input.dueCards === 1 ? " is" : "s are"} due. Right on time is what makes them stick.`,
            fil: `${input.dueCards} card ang dapat i-review ngayon. Sakto ang oras para tumatak.`,
          }),
          concepts: [],
          ...pending,
        }),
      });
    }
    if (slots.length === 0) {
      slots.push({
        key: "focus",
        share: 1,
        min: 1,
        block: (minutes) => ({
          key: "focus",
          method: "pomodoro",
          label: "Focus Block",
          minutes,
          reason: say(lang, {
            taglish: "Wala pang due at wala pang material, kaya focus block muna. Ikaw ang bahala sa aaralin.",
            en: "Nothing is due and there's no material yet, so this is a plain focus block. You pick what to study.",
            fil: "Wala pang dapat i-review at wala pang material, kaya focus block muna. Ikaw ang pipili ng aaralin.",
          }),
          concepts: [],
          ...pending,
        }),
      });
    }
  }

  const minutes = allocateMinutes(total - reserved, slots);
  const blocks = [...head, ...slots.map((slot, index) => slot.block(minutes[index]))];
  const count = blocks.length;
  const exam = input.exam;
  const intro = exam
    ? say(lang, {
        taglish: `Ako na bahala. ${total} minutes, ${count} blocks — para sa ${examName(exam.title)} mo${exam.daysLeft <= 1 ? (exam.daysLeft <= 0 ? " ngayon" : " bukas") : ` in ${exam.daysLeft} days`}.`,
        en: `Leave it to me. ${total} minutes, ${count} blocks — for your ${examName(exam.title)}${exam.daysLeft <= 1 ? (exam.daysLeft <= 0 ? " today" : " tomorrow") : ` in ${exam.daysLeft} days`}.`,
        fil: `Ako na ang bahala. ${total} minuto, ${count} bahagi — para sa ${examName(exam.title)} mo${exam.daysLeft <= 1 ? (exam.daysLeft <= 0 ? " ngayon" : " bukas") : ` sa loob ng ${exam.daysLeft} araw`}.`,
      })
    : material
      ? say(lang, {
          taglish: `Ako na bahala. ${total} minutes, ${count} blocks sa ${material.title}.`,
          en: `Leave it to me. ${total} minutes, ${count} blocks on ${material.title}.`,
          fil: `Ako na ang bahala. ${total} minuto, ${count} bahagi sa ${material.title}.`,
        })
      : say(lang, {
          taglish: `Ako na bahala. ${total} minutes, ${count} block${count === 1 ? "" : "s"}.`,
          en: `Leave it to me. ${total} minutes, ${count} block${count === 1 ? "" : "s"}.`,
          fil: `Ako na ang bahala. ${total} minuto, ${count} bahagi.`,
        });
  return { blocks, intro, title: `Tamari's ${total}-Minute Bitaw` };
}

/** Tamari's reaction when a plan is done (companion doc §6): the score, and whether the retest beat the first quiz. */
export function planDoneLine(lang: TamariLanguage, result: { correct: number; answered: number; firstAccuracy: number | null; lastAccuracy: number | null }): { text: string; state: "confident" | "idle" | "serious" } {
  if (result.answered <= 0) {
    return {
      state: "idle",
      text: say(lang, { taglish: "Sa susunod na lang. Kahit 10 minutes lang, ayos na.", en: "Next time, then. Even 10 minutes counts.", fil: "Sa susunod na lang. Kahit 10 minuto lang, ayos na." }),
    };
  }
  const score = `${result.correct}/${result.answered}`;
  const accuracy = result.correct / result.answered;
  const better = result.firstAccuracy !== null && result.lastAccuracy !== null && result.lastAccuracy > result.firstAccuracy;
  if (accuracy >= 0.8) {
    return {
      state: "confident",
      text: better ? say(lang, { taglish: `Bitaw. ${score}. Mas okay na.`, en: `Bitaw. ${score}. Better already.`, fil: `Bitaw. ${score}. Mas maayos na.` }) : say(lang, { taglish: `Bitaw. ${score}. Gets mo na 'to.`, en: `Bitaw. ${score}. You've got this.`, fil: `Bitaw. ${score}. Gets mo na 'to.` }),
    };
  }
  if (accuracy >= 0.5) {
    return {
      state: "idle",
      text: better ? say(lang, { taglish: `Ayun. ${score}. Mas okay na — isa pa bukas.`, en: `There we go. ${score}. Better — one more tomorrow.`, fil: `Ayun. ${score}. Mas maayos na — isa pa bukas.` }) : say(lang, { taglish: `${score}. Isa pa bukas, balikan natin.`, en: `${score}. One more tomorrow; we'll go back over it.`, fil: `${score}. Isa pa bukas, balikan natin.` }),
    };
  }
  return { state: "serious", text: say(lang, { taglish: `${score}. Hindi pa. Try ulit bukas — sisimulan ko sa mga namiss mo.`, en: `${score}. Not yet. Try again tomorrow — I'll start with what you missed.`, fil: `${score}. Hindi pa. Subukan ulit bukas — sisimulan ko sa mga namali mo.` }) };
}

/** Tamari's reaction to a finished plan, from its combined summary (which keeps the first quiz's and the last retest's accuracy). */
export function planReaction(lang: TamariLanguage, summary: Pick<SessionSummary, "correct" | "questionsAnswered" | "extra">) {
  const extra = (summary.extra ?? {}) as { firstAccuracy?: unknown; lastAccuracy?: unknown };
  const accuracy = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return planDoneLine(lang, { correct: summary.correct, answered: summary.questionsAnswered, firstAccuracy: accuracy(extra.firstAccuracy), lastAccuracy: accuracy(extra.lastAccuracy) });
}

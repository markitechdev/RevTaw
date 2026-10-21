import { normalizeSpeech } from "@/lib/voice/intents";

/**
 * What Tamari can do straight from a sentence, typed or spoken, in English,
 * Filipino or Taglish (companion doc §5, §7, §14–§15):
 *
 * - "Tamari, 20 minutes lang ako. Bahala ka na." / "10 minutes lang meron
 *   ako" / "I have 30 minutes" → plan that time (Tamari's N-Minute Bitaw).
 * - "Quiz me about Chapter 4" / "Quiz mo 'ko dito" → write a quiz on the
 *   material in view, on that topic.
 * - "May exam ako Friday, gawan mo 'ko review" → add the exam on that day
 *   and build its review plan.
 * - "Move this to Friday" / "Ilipat mo 'to sa Biyernes" → move the selected
 *   planner task.
 *
 * Only clear requests become commands; anything else is a question for
 * Tamari. Dates are local calendar days (YYYY-MM-DD). Pure and client-safe.
 */

export type TamariCommand =
  | { kind: "plan"; minutes: number }
  | { kind: "quiz"; topic: string | null }
  | { kind: "exam"; date: string; title: string | null }
  | { kind: "move"; date: string };

const NUMBER_WORDS: Record<string, number> = {
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  "twenty five": 25,
  thirty: 30,
  forty: 40,
  "forty five": 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
  lima: 5,
  limang: 5,
  sampu: 10,
  sampung: 10,
  labinlima: 15,
  labinlimang: 15,
  dalawampu: 20,
  dalawampung: 20,
  tatlumpu: 30,
  tatlumpung: 30,
  apatnapu: 40,
  apatnapung: 40,
  isang: 1,
  isa: 1,
  one: 1,
  an: 1,
  a: 1,
  dalawang: 2,
  two: 2,
};
const NUMBER = `(\\d{1,3}|${Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|")})`;
const UNIT = "(minutes?|mins?|minuto|minutos|min|m|hours?|hrs?|hr|oras)";
const DURATION = new RegExp(`\\b(?:(half an hour|half hour|kalahating oras)|${NUMBER}\\s*-?\\s*${UNIT})\\b`);

type Duration = { minutes: number; start: number; end: number };

/** "20 minutes", "isang oras", "half an hour" → minutes (5–120) and where it was said, or null. */
function findDuration(text: string): Duration | null {
  const match = DURATION.exec(text);
  if (!match) return null;
  const span = { start: match.index, end: match.index + match[0].length };
  if (match[1]) return { minutes: 30, ...span };
  const raw = match[2];
  const count = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? NaN);
  if (!Number.isFinite(count) || count <= 0) return null;
  // A bare "m" only counts after digits ("20m").
  if (match[3] === "m" && !/^\d+$/.test(raw)) return null;
  const minutes = /^(hours?|hrs?|hr|oras)$/.test(match[3]) ? count * 60 : count;
  return { minutes: Math.max(5, Math.min(120, Math.round(minutes))), ...span };
}

export function durationIn(text: string): number | null {
  return findDuration(text)?.minutes ?? null;
}

/** Whether the words around a duration ask Tamari to plan that time (not just mention it). */
function asksToPlan(text: string, duration: Duration): boolean {
  const before = text.slice(0, duration.start).trim();
  const after = text.slice(duration.end).trim();
  return (
    // "20 minutes lang (ako)", "20 minutes na lang ang meron ako"
    /^(na\s+)?(lang|lng|lamang)\b/.test(after) ||
    /^(na\s+)?(lang\s+)?(ang\s+)?(meron|mayroon|available|free)\b/.test(after) ||
    // "may 30 minutes ako", "meron akong 20 minutes"
    /\b(may|meron|mayroon)(\s+(ako|akong|kaming|pa|pa akong))?(\s+na)?$/.test(before) ||
    // "I have 20 minutes", "I've got an hour", "I only have 15 minutes"
    /\b(i have|i ve got|ive got|i got|i only have|only have|i have only|i just have|got|have)(\s+(about|around|like|maybe|only|just))?$/.test(before) ||
    // "plan 20 minutes for me", "make me a 30 minute plan", "a 20-minute session"
    /\b(plan|planuhin|schedule|isched)\b/.test(before) ||
    /^(\w+\s+){0,2}(plan|session|study plan|review plan|bitaw|review)\b/.test(after) ||
    // "bahala ka na", "ikaw na bahala", "leave it to you"
    /\b(bahala ka|ikaw na (ang )?bahala|ikaw bahala|leave it to you|up to you)\b/.test(text) ||
    // "what can I do in 20 minutes?", "ano pwede kong aralin sa 20 minutes?"
    (/\b(in|sa|within|for)$/.test(before) && /\b(what (can|should) i (do|study|review)|ano (ang )?(pwede|puwede|kaya|dapat) (kong |ko )?(gawin|aralin))\b/.test(before))
  );
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\b(sunday|linggo)\b/, 0],
  [/\b(monday|lunes)\b/, 1],
  [/\b(tuesday|martes)\b/, 2],
  [/\b(wednesday|miyerkules|miyerkoles|myerkules)\b/, 3],
  [/\b(thursday|huwebes)\b/, 4],
  [/\b(friday|biyernes|byernes)\b/, 5],
  [/\b(saturday|sabado)\b/, 6],
];

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** "Friday", "bukas", "next Monday", "today" → the calendar day after `today` it means, or null. */
export function dayIn(text: string, today: string): string | null {
  if (/\b(today|ngayon|ngayong araw)\b/.test(text) && !/\bngayong (linggo|lunes|martes|miyerkules|huwebes|biyernes|sabado)\b/.test(text)) return today;
  if (/\b(day after tomorrow|makalawa|sa makalawa)\b/.test(text)) return addDays(today, 2);
  if (/\b(tomorrow|bukas)\b/.test(text)) return addDays(today, 1);
  if (/\bnext week\b|\bsa susunod na linggo\b/.test(text)) return addDays(today, 7);
  const current = new Date(`${today}T00:00:00Z`).getUTCDay();
  for (const [pattern, weekday] of WEEKDAYS) {
    if (!pattern.test(text)) continue;
    // The next one after today ("Friday" said on a Friday means next week's).
    let ahead = (weekday - current + 7) % 7 || 7;
    if (/\bnext\b|\bsa susunod na\b/.test(text) && ahead < 7) ahead += 7;
    return addDays(today, ahead);
  }
  return null;
}

/** The original words after a keyword, without trailing politeness. */
function tail(original: string, keyword: RegExp): string | null {
  const match = keyword.exec(original);
  if (!match) return null;
  const rest = original
    .slice(match.index + match[0].length)
    .replace(/[.!?]+\s*$/, "")
    .replace(/\s+(naman|please|po|nga|na lang|lang)$/i, "")
    .trim();
  return rest.length > 0 ? rest.slice(0, 120) : null;
}

const QUIZ = /\b(quiz|test)\s+(me|mo\s+(ako|ko|kami)|ako)\b/;
const QUIZ_MAKE = /\b(give me|bigyan mo (ako|ko) ng|gawan mo (ako|ko) ng|gumawa ka ng|make me|generate|create|write me)\s+(a\s+|an\s+|ng\s+)?(short\s+|quick\s+|maikling\s+)?(quiz|practice test|pagsusulit)\b/;
const HERE = /^(here|dito|this|ito|this one|on this|on this page|sa ito|dito na|dito lang|about this)$/i;
const EXAM = /\b(exam|test|midterms?|finals?|quiz|long test|pagsusulit|prelims?)\b/;
/** "May exam ako…", "I have a Calculus exam…": the student says they have one (a question about an exam is not this). */
const EXAM_HAVE = /^(?:(?:so|uy|oy|kasi|eh)\s+)?(?:may|meron|mayroon|i have|i ve got|ive got|i got|theres|there is|i have got)\b/;
const MOVE = /\b(move|reschedule|resched|ilipat|i lipat|lipat|ilagay|i move|imove|push)\b/;

/** Turns a sentence into one of Tamari's commands, or null for a question. */
export function parseTamariCommand(message: string, today: string): TamariCommand | null {
  const original = message.replace(/\s+/g, " ").trim();
  const text = normalizeSpeech(original);
  if (!text || text.split(" ").length > 24) return null;

  // Moving the selected task: "move this to Friday", "ilipat mo 'to sa Biyernes".
  if (MOVE.test(text) && !EXAM.test(text)) {
    const date = dayIn(text, today);
    if (date) return { kind: "move", date };
  }

  // An exam on a day: "May exam ako Friday, gawan mo 'ko review", "I have a Calculus exam on Monday".
  if (EXAM.test(text) && EXAM_HAVE.test(text) && !QUIZ.test(text)) {
    const date = dayIn(text, today);
    if (date) {
      const named = /\b(?:may|meron|mayroon|have|ve got|got|my)\s+(?:akong\s+|an?\s+|ng\s+)?([a-z][\w-]{2,30}(?:\s+[a-z][\w-]{2,30})?)\s+(?:exam|test|midterms?|finals?|long test|prelims?)\b/.exec(text);
      const word = named?.[1]?.trim() ?? null;
      const title = word && !/^(ako|akong|na|ng|the|a|an|big|final|long)$/.test(word) ? original.match(new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i"))?.[1] ?? word : null;
      return { kind: "exam", date, title };
    }
  }

  // A quiz: "quiz me about Chapter 4", "quiz mo 'ko dito", "gawan mo ako ng quiz sa recursion".
  if (QUIZ.test(text) || QUIZ_MAKE.test(text)) {
    const keyword = QUIZ.test(text)
      ? /\b(?:quiz|test)\s+(?:me|mo\s+(?:ako|ko|'ko|kami)|ako)\b/i
      : /\b(?:give me|bigyan mo (?:ako|ko) ng|gawan mo (?:ako|ko) ng|gumawa ka ng|make me|generate|create|write me)\s+(?:a\s+|an\s+|ng\s+)?(?:short\s+|quick\s+|maikling\s+)?(?:quiz|practice test|pagsusulit)\b/i;
    const rest = tail(original.replace(/[’']/g, "'").replace(/\bmo 'ko\b/i, "mo ko"), keyword);
    const topic = rest
      ?.replace(/^(about|on|regarding|sa|tungkol sa|tungkol|ng|in|with)\s+/i, "")
      .replace(/^(the\s+)/i, "")
      .trim();
    return { kind: "quiz", topic: !topic || HERE.test(topic) ? null : topic };
  }

  // Time to plan: "20 minutes lang ako", "may 30 minutes ako", "I have an hour, bahala ka na".
  const duration = findDuration(text);
  if (duration && asksToPlan(text, duration)) return { kind: "plan", minutes: duration.minutes };
  return null;
}

/** "Friday, Oct 23": how Tamari says a planned day. */
export function spokenDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
}

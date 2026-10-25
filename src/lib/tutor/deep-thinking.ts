/**
 * Which of Tamari's questions get more thinking time: math to work out, code to read or fix, and problems
 * to solve (word problems, physics and chemistry with numbers, proofs, algorithm analysis), in English,
 * Filipino or Taglish. Those get "medium" reasoning instead of the usual "low": slower and more tokens, for a
 * better-checked answer. A plain "what is…", "explain…" or a greeting stays quick. A miss either way only
 * changes how long Tamari thinks, so this stays a simple, readable check. Pure and client-safe.
 */

/** Code quoted in the question: a fence, or two or more kinds of typical syntax. */
const CODE_SYNTAX = [
  /```/,
  /\b(def|function|return|public static|void|int main|console\.log|system\.out|printf|scanf|cout|#include|elif|lambda)\b/,
  /\bselect\b[\s\S]{1,200}\bfrom\b/,
  /\b(insert into|update \w+ set|delete from|create table)\b/,
  /(==|!=|<=|>=|=>|\+\+|&&|\|\|)\s*[\w(]/,
  /[{};]\s*$/m,
];

/** Asking to trace, fix or analyze code or an algorithm. */
const CODE_WORK =
  /\b(debug|fix (my|this|the) (code|program|function|query|error)|bug|error message|exception|stack trace|(doesn'?t|won'?t) compile|syntax error|output of (this|the) (code|program)|what does this (code|program|function|loop|query) (print|output|return|do)|trace (the|this) (code|loop|program)|time complexity|space complexity|big[- ]?o)\b/;

/** Arithmetic, equations and math notation. */
const MATH_NOTATION = [
  /\d\s*[+*×÷^]\s*\(?\d/, // 2 + 3, 4^2, 6 × (2
  /\d\s+[-−]\s+\d/, // 10 - 4 (not a range such as "chapters 1-3")
  /\d(\.\d+)?\s*%\s*(of|ng)\b/, // 15% of 80
  /\b\d*[a-z]\s*[+\-*/^]\s*\d*[a-z(]?\s*[=<>]/, // 2x + 3 = 7
  /\b\d*[a-z]\s*(\^|\*\*)\s*\d/, // x^2
  /\b[a-z]\s*[=<>≤≥]\s*-?\d/, // x = 4, y > 2
  /(^|[^\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/, // 2/3 (not a date such as 10/26/2026)
  /[√∫∑Σπ≤≥≠²³]/,
  /\b(sin|cos|tan|log|ln)\s*\(?\s*[\dxθ]/,
];

/** Asking to work something out (English, Filipino and Taglish). */
const SOLVE_WORDS = new RegExp(
  "\\b(" +
    [
      "solve",
      "solving",
      "calculate",
      "compute",
      "derive",
      "derivative",
      "differentiate",
      "integral",
      "integrate",
      "prove",
      "proof",
      "factori[sz]e",
      "factor (the|this|out)",
      "evaluate (the |this )?(expression|integral|limit|function)",
      "simplify (the |this )?(expression|equation|fraction)",
      "find the (value|area|perimeter|volume|slope|equation|derivative|integral|probability|limit|sum|mean|median|roots?|missing)",
      "quadratic",
      "polynomial",
      "logarithms?",
      "determinant",
      "inverse (of a )?matrix",
      "matrix multiplication",
      "probability",
      "permutations?",
      "how many (ways|combinations)",
      "standard deviation",
      "pythagorean",
      "theorem",
      "trigonometr\\w*",
      "limit of",
      "word problem",
      "show (the|your) (solution|work|steps)",
      "step[- ]by[- ]step solution",
      "lutasin",
      "kalkulahin",
      "kuwentahin",
      "kwentahin",
      "kompyutin",
      "i-?solve",
      "i-?compute",
      "solusyon",
      "paano (i-?solve|kunin|makuha)",
    ].join("|") +
    ")\\b",
);

/** A quantity question with numbers in it: a word problem ("If Ana has 5 mangoes…, ilan ang natira?"). */
const WORD_PROBLEM = /\b(how many|how much|ilan|magkano)\b[\s\S]*\d|\d[\s\S]*\b(how many|how much|ilan|magkano)\b/;

/** Physics and chemistry problems: numbers with units, or the quantities they ask for. */
const SCIENCE_PROBLEM = [
  /\d(\.\d+)?\s*(m\/s2?|m\/s²|km\/h|kph|mph|kg|mol|moles|joules?|kj|watts?|volts?|amps?|ohms?|newtons?|°c|°f|kelvin|ml|liters?|grams?)\b/,
  /\b(velocity|acceleration|displacement|momentum|kinetic energy|potential energy|work done|net force|molarity|molality|stoichiometry|limiting reactant|ph of|half-life|ohm'?s law|free fall)\b/,
];

function isProblem(raw: string): boolean {
  const text = raw.normalize("NFKC").toLowerCase();
  if (CODE_WORK.test(text)) return true;
  if (CODE_SYNTAX.filter((pattern) => pattern.test(text)).length >= 2) return true;
  if (SOLVE_WORDS.test(text) || WORD_PROBLEM.test(text)) return true;
  if (MATH_NOTATION.some((pattern) => pattern.test(text))) return true;
  return SCIENCE_PROBLEM.some((pattern) => pattern.test(text));
}

/**
 * Whether a question deserves more thinking. `context` is what the question is about when it doesn't say
 * (the highlighted text, the question a follow-up is under), checked the same way.
 */
export function needsDeepThinking(message: string, context: Array<string | null | undefined> = []): boolean {
  return [message, ...context].some((text) => Boolean(text) && isProblem(text!));
}

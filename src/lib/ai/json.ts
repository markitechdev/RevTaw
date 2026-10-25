import "server-only";

import type { z } from "zod";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiProvider } from "@/lib/ai/types";

/**
 * Reads the JSON object (or array) in a model's reply. The reply is usually JSON and nothing else. A model
 * without JSON mode may wrap it in a ```json fence or a sentence, and the JSON's own strings may hold code
 * fences (an answer with a code block), so the reply is read as a whole first and then scanned bracket by
 * bracket, skipping whatever is inside strings: a fence inside a string is never mistaken for the wrapper.
 * Almost-JSON is read too: raw line breaks or stray backslashes inside strings, and trailing commas.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Not JSON on its own: look for it inside the reply.
  }

  let start = trimmed.search(/[{[]/);
  if (start === -1) {
    throw new AiError("invalid_output", "No JSON found in model output");
  }
  let firstError: string | null = null;
  let array: { value: unknown } | null = null;
  while (start !== -1) {
    const end = closingBracket(trimmed, start);
    if (end === -1) {
      throw new AiError("invalid_output", "Unterminated JSON in model output");
    }
    const parsed = parseLenient(trimmed.slice(start, end + 1));
    if (parsed.ok) {
      // The callers all want an object: a "[1]" in the sentence before it is not the reply.
      if (!Array.isArray(parsed.value)) return parsed.value;
      array ??= { value: parsed.value };
    } else {
      firstError ??= parsed.error;
    }
    const next = trimmed.slice(end + 1).search(/[{[]/);
    start = next === -1 ? -1 : end + 1 + next;
  }
  if (array) return array.value;
  throw new AiError("invalid_output", firstError ?? "JSON parse failed");
}

/** Where the object or array opening at `start` closes, with brackets inside strings skipped; -1 if it never does. */
function closingBracket(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseLenient(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const repaired = repairJson(text);
    if (repaired !== text) {
      try {
        return { ok: true, value: JSON.parse(repaired) };
      } catch {
        // Report the original problem.
      }
    }
    return { ok: false, error: error instanceof Error ? error.message : "JSON parse failed" };
  }
}

const ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const CONTROL_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };

/**
 * Fixes what models without JSON mode get wrong: inside strings, a raw line break (or another control
 * character) is escaped, and a backslash that starts no valid escape (LaTeX's "\(", a regex's "\d") is kept
 * as a backslash; outside strings, a comma before a closing bracket is dropped.
 */
function repairJson(text: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!inString) {
      if (char === '"') inString = true;
      if (char === "," && /^\s*[}\]]/.test(text.slice(index + 1, index + 64))) continue;
      out += char;
      continue;
    }
    if (char === '"') {
      inString = false;
      out += char;
    } else if (char === "\\") {
      const next = text[index + 1] ?? "";
      if (ESCAPES.has(next) || (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6)))) {
        out += char + next;
        index += 1;
      } else {
        out += "\\\\";
      }
    } else if (char < " ") {
      out += CONTROL_ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    } else {
      out += char;
    }
  }
  return out;
}

/** A JSON request and its repair share this much time, under the AI routes' 120-second limit. */
export const JSON_DEADLINE_MS = 110_000;
/** A repair needs at least this long to be worth starting. */
const MIN_REPAIR_MS = 8_000;

export type JsonGenerateResult<T> = {
  data: T;
  raw: AiGenerateResult;
  attempts: number;
};

/**
 * Generates a JSON object and validates it against a zod schema. On a parse or
 * validation failure the model is asked once to repair its own output.
 */
export async function generateJson<T>(
  provider: AiProvider,
  schema: z.ZodType<T>,
  options: AiGenerateOptions,
): Promise<JsonGenerateResult<T>> {
  // One deadline for the call and its repair, so together they finish inside the route's time limit.
  const deadline = options.deadline ?? Date.now() + JSON_DEADLINE_MS;
  const first = await provider.generate({ ...options, json: true, deadline });
  const firstAttempt = parseAndValidate(schema, first.text);
  if (firstAttempt.ok) {
    return { data: firstAttempt.data, raw: first, attempts: 1 };
  }
  if (deadline - Date.now() < MIN_REPAIR_MS) {
    throw new AiError("invalid_output", `${firstAttempt.error} (no time left to repair it)`);
  }

  const repair = await provider.generate({
    ...options,
    deadline,
    timeoutMs: Math.min(options.timeoutMs ?? Number.POSITIVE_INFINITY, deadline - Date.now()),
    json: true,
    temperature: 0,
    // A repair is part of the same request: it does not count toward the student's daily limit.
    attempt: 2,
    messages: [
      ...options.messages,
      { role: "assistant", content: first.text.slice(0, 20_000) },
      {
        role: "user",
        content:
          `Your previous answer was not valid for the required schema (${firstAttempt.error}). ` +
          "Return the corrected JSON object only, with the same information, and nothing else.",
      },
    ],
  });
  const secondAttempt = parseAndValidate(schema, repair.text);
  if (secondAttempt.ok) {
    return {
      data: secondAttempt.data,
      raw: {
        ...repair,
        usage: {
          inputTokens: first.usage.inputTokens + repair.usage.inputTokens,
          outputTokens: first.usage.outputTokens + repair.usage.outputTokens,
        },
      },
      attempts: 2,
    };
  }

  throw new AiError("invalid_output", secondAttempt.error);
}

function parseAndValidate<T>(
  schema: z.ZodType<T>,
  text: string,
): { ok: true; data: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (error) {
    // The reason, not the student-facing message: it goes into the repair request and the server log.
    return { ok: false, error: error instanceof AiError ? (error.detail ?? error.message) : error instanceof Error ? error.message : "invalid JSON" };
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const issues = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
  return { ok: false, error: issues };
}

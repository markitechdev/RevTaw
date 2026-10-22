import "server-only";

import type { z } from "zod";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiProvider } from "@/lib/ai/types";

/**
 * Pulls the first JSON object/array out of a model response, tolerating code
 * fences and surrounding prose.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to a bracket scan
  }

  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new AiError("invalid_output", "No JSON found in model output");
  }
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end <= start) {
    throw new AiError("invalid_output", "Unterminated JSON in model output");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new AiError("invalid_output", error instanceof Error ? error.message : "JSON parse failed");
  }
}

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
  const first = await provider.generate({ ...options, json: true });
  const firstAttempt = parseAndValidate(schema, first.text);
  if (firstAttempt.ok) {
    return { data: firstAttempt.data, raw: first, attempts: 1 };
  }

  const repair = await provider.generate({
    ...options,
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
    return { ok: false, error: error instanceof Error ? error.message : "invalid JSON" };
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

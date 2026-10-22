import type { AiGenerateOptions } from "@/lib/ai/types";

/**
 * Request-size estimates used to route calls before they are sent.
 *
 * Exact token counts need each model's tokenizer; a character ratio is close
 * enough to decide whether a request fits a provider's budget (Groq's free
 * plan allows 8K tokens a minute per model, and counts the requested output
 * cap as part of the request). 3.2 characters per token is conservative for
 * English, Filipino and Taglish text.
 */
export const CHARS_PER_TOKEN = 3.2;

/** Tokens charged for each image on vision models (a rough upper bound for one page). */
const TOKENS_PER_IMAGE = 1_600;
/** Per-message framing tokens (role markers and separators). */
const TOKENS_PER_MESSAGE = 8;

/** Default output cap when a caller does not set maxTokens. */
export const DEFAULT_MAX_TOKENS = 4_096;

export function estimateInputTokens(options: Pick<AiGenerateOptions, "system" | "messages">): number {
  let chars = options.system?.length ?? 0;
  let images = 0;
  for (const message of options.messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const part of message.content) {
      if (part.type === "text") chars += part.text.length;
      else images += 1;
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN) + options.messages.length * TOKENS_PER_MESSAGE + images * TOKENS_PER_IMAGE;
}

/** Input estimate plus the output tokens the request reserves. */
export function estimateRequestTokens(options: Pick<AiGenerateOptions, "system" | "messages">, outputTokens: number): number {
  return estimateInputTokens(options) + Math.max(0, outputTokens);
}

export function hasImages(options: Pick<AiGenerateOptions, "messages">): boolean {
  return options.messages.some((message) => typeof message.content !== "string" && message.content.some((part) => part.type === "image"));
}

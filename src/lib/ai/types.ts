/**
 * Provider-agnostic AI contract. Every provider adapter implements
 * `AiProvider`; application code only ever talks to this interface so the
 * vendor can be swapped with an environment variable.
 */

export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = { type: "image"; mimeType: string; data: string }; // base64
export type AiContentPart = AiTextPart | AiImagePart;

export type AiMessage = {
  role: "user" | "assistant";
  content: string | AiContentPart[];
};

export type AiGenerateOptions = {
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object (best effort; output is still validated). */
  json?: boolean;
  /**
   * Optional strict JSON schema. Providers that support strict structured
   * output (Groq's gpt-oss models) enforce it; the others fall back to `json`.
   * In strict mode every property must be required and every object must set
   * additionalProperties: false.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Free-form label used for logging, routing, daily limits and by the mock provider. */
  task?: string;
  /** 1 for a first call, 2 for generateJson's repair call (which does not count toward daily limits). */
  attempt?: number;
  signal?: AbortSignal;
  /** Per-call timeout set by the router so a fallback still fits the route's time limit. */
  timeoutMs?: number;
  /**
   * When the whole request must be done (epoch milliseconds). generateJson
   * sets it once for the first call and its repair, so the pair fits the
   * route's time limit; the router never runs past it.
   */
  deadline?: number;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AiGenerateResult = {
  text: string;
  usage: AiUsage;
  provider: string;
  model: string;
  stopReason?: string;
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsVision: boolean;
  /** How long one call may take before the router moves on to the next provider (its own default otherwise). */
  readonly timeoutMs?: number;
  generate(options: AiGenerateOptions): Promise<AiGenerateResult>;
  /**
   * Whether a request fits this provider's per-request budget (for example
   * Groq's free 8K tokens a minute). The router skips providers that say no.
   * Providers without a budget leave this out.
   */
  fits?(options: AiGenerateOptions): boolean;
}

/** Model tiers (spec §46): cheaper models for simple tasks, stronger for reasoning. */
export type AiTier = "fast" | "strong";

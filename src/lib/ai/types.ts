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
  /** Free-form label used for logging and by the mock provider. */
  task?: string;
  signal?: AbortSignal;
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
  generate(options: AiGenerateOptions): Promise<AiGenerateResult>;
}

/** Model tiers (spec §46): cheaper models for simple tasks, stronger for reasoning. */
export type AiTier = "fast" | "strong";

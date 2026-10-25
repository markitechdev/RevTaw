import "server-only";

import { DEFAULT_MAX_TOKENS, estimateRequestTokens, hasImages } from "@/lib/ai/budget";
import { AiError } from "@/lib/ai/errors";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";
import type { AiGenerateOptions, AiGenerateResult, AiMessage, AiProvider } from "@/lib/ai/types";

export type ReasoningEffort = "low" | "medium" | "high";

/**
 * Extra output tokens reserved for a reasoning model's thinking, which counts
 * toward the output cap. Without it a tight cap can end the reply mid-JSON.
 */
const REASONING_ALLOWANCE: Record<ReasoningEffort, number> = { low: 768, medium: 2_048, high: 6_144 };

export type OpenAiCompatibleConfig = {
  /** Provider label stored with results and used by the router: "groq", "cloudflare" or "ollama". */
  name: string;
  /** API base ending in /v1, e.g. https://api.groq.com/openai/v1. */
  baseUrl: string;
  /** Bearer token. Ollama ignores it, so it may be empty there. */
  apiKey?: string;
  model: string;
  /** Model for requests that contain images. Without one, the provider takes text only. */
  visionModel?: string;
  /** Output cap field: Groq uses max_completion_tokens; Cloudflare and Ollama use max_tokens. */
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  /** Send text requests to /responses instead of /chat/completions (Cloudflare's gpt-oss models). */
  useResponsesApi?: boolean;
  /** reasoning_effort for reasoning models such as gpt-oss; leave unset for other models. */
  reasoningEffort?: ReasoningEffort;
  /** Whether this model enforces strict json_schema output (Groq's gpt-oss models). */
  strictJsonSchema?: boolean;
  /** Whether response_format json_object may be sent. Off where it is unsupported. */
  jsonObject?: boolean;
  /** Largest request, in estimated input plus output tokens, this provider accepts. */
  maxRequestTokens?: number;
  /** Extra request fields, e.g. Groq's include_reasoning: false. */
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
};

type ChatContentPart = { type?: string; text?: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | ChatContentPart[] | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  // Cloudflare's native shape, in case a gateway returns it.
  result?: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
};

type ResponsesOutputItem = {
  type?: string;
  role?: string;
  content?: string | ChatContentPart[];
  text?: string;
};

type ResponsesApiResponse = {
  output?: ResponsesOutputItem[];
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
};

function joinText(content: string | ChatContentPart[] | null | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((part) => (part.type === undefined || part.type === "text" || part.type === "output_text") && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function messageText(message: AiMessage): string {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n");
}

export function toChatMessages(system: string | undefined, messages: AiMessage[]) {
  const converted = messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text" as const, text: part.text }
              : { type: "image_url" as const, image_url: { url: `data:${part.mimeType};base64,${part.data}` } },
          ),
  }));
  return system ? [{ role: "system" as const, content: system }, ...converted] : converted;
}

/** The answer text from a Responses API reply, skipping reasoning items. */
export function responsesText(data: ResponsesApiResponse): string {
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type === "reasoning") continue;
    if (item.type === "message" || item.role === "assistant") {
      parts.push(joinText(item.content ?? null));
    } else if (item.type === "output_text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  const joined = parts.join("");
  return joined || (typeof data.output_text === "string" ? data.output_text : "");
}

/**
 * One adapter for every OpenAI-compatible API RevTaw uses: Groq, Cloudflare
 * Workers AI and a local Ollama. Each instance is set by base URL, key and
 * model; the router (src/lib/ai/router.ts) decides which one a request uses.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsVision: boolean;

  get timeoutMs(): number | undefined {
    return this.config.timeoutMs;
  }

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.name = config.name;
    this.model = config.model;
    this.supportsVision = Boolean(config.visionModel);
  }

  /** Output tokens a request reserves, including the reasoning allowance. */
  outputTokens(options: Pick<AiGenerateOptions, "maxTokens" | "messages">): number {
    const base = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const usesVision = hasImages(options);
    return usesVision || !this.config.reasoningEffort ? base : base + REASONING_ALLOWANCE[this.config.reasoningEffort];
  }

  /** Estimated input tokens plus the output the request reserves (what a token budget sets aside for it). */
  requestTokens(options: AiGenerateOptions): number {
    return estimateRequestTokens(options, this.outputTokens(options));
  }

  fits(options: AiGenerateOptions): boolean {
    if (hasImages(options) && !this.supportsVision) return false;
    if (!this.config.maxRequestTokens) return true;
    return this.requestTokens(options) <= this.config.maxRequestTokens;
  }

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const images = hasImages(options);
    if (images && !this.config.visionModel) {
      throw new AiError("unsupported", `${this.name} has no vision model configured`, false);
    }
    if (!images && this.config.useResponsesApi) {
      const viaResponses = await this.generateWithResponses(options);
      if (viaResponses) return viaResponses;
    }
    return this.generateWithChat(options, images ? this.config.visionModel! : this.config.model, images);
  }

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
    };
  }

  private async generateWithChat(options: AiGenerateOptions, model: string, images: boolean): Promise<AiGenerateResult> {
    const body: Record<string, unknown> = {
      model,
      messages: toChatMessages(options.system, options.messages),
      temperature: options.temperature ?? 0.2,
      [this.config.maxTokensField ?? "max_tokens"]: images ? (options.maxTokens ?? DEFAULT_MAX_TOKENS) : this.outputTokens(options),
      ...(images ? {} : (this.config.extraBody ?? {})),
    };
    if (!images && this.config.reasoningEffort) {
      body.reasoning_effort = this.config.reasoningEffort;
    }
    if (options.jsonSchema && this.config.strictJsonSchema && !images) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.schema },
      };
    } else if ((options.json || options.jsonSchema) && this.config.jsonObject !== false) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetchWithTimeout(
      this.url("/chat/completions"),
      { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
      options.signal,
      options.timeoutMs ?? this.config.timeoutMs,
    );
    if (!response.ok) {
      throw await statusToAiError(this.name, response);
    }

    const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
    const choice = data?.choices?.[0];
    const text = (joinText(choice?.message?.content) || data?.result?.response || "").trim();
    const stopReason = choice?.finish_reason ?? undefined;
    if (!text) {
      throw new AiError(
        "invalid_output",
        `${this.name} returned no message content${stopReason === "length" ? " (output cap reached, likely while reasoning)" : ""}`,
      );
    }
    const usage = data?.usage ?? data?.result?.usage;
    return {
      text,
      usage: { inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 },
      provider: this.name,
      model: data?.model || model,
      stopReason,
    };
  }

  /**
   * Cloudflare documents its gpt-oss models on the Responses API. Returns null
   * when the endpoint rejects the request format, so the caller can retry the
   * same model on chat completions.
   */
  private async generateWithResponses(options: AiGenerateOptions): Promise<AiGenerateResult | null> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      input: options.messages.map((message) => ({ role: message.role, content: messageText(message) })),
      ...(options.system ? { instructions: options.system } : {}),
      max_output_tokens: this.outputTokens(options),
      temperature: options.temperature ?? 0.2,
      stream: false,
      ...(this.config.reasoningEffort ? { reasoning: { effort: this.config.reasoningEffort } } : {}),
    };

    const response = await fetchWithTimeout(
      this.url("/responses"),
      { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
      options.signal,
      options.timeoutMs ?? this.config.timeoutMs,
    );
    if (!response.ok) {
      if ([400, 404, 405, 415, 422].includes(response.status)) {
        console.warn(`ai: ${this.name} /responses answered HTTP ${response.status}; retrying on /chat/completions`);
        return null;
      }
      throw await statusToAiError(this.name, response);
    }

    const data = (await response.json().catch(() => null)) as ResponsesApiResponse | null;
    const text = data ? responsesText(data).trim() : "";
    const incomplete = data?.status === "incomplete";
    const stopReason = incomplete
      ? data?.incomplete_details?.reason === "max_output_tokens"
        ? "length"
        : (data?.incomplete_details?.reason ?? "incomplete")
      : "stop";
    if (!text) {
      throw new AiError("invalid_output", `${this.name} returned no output text (status ${data?.status ?? "unknown"})`);
    }
    return {
      text,
      usage: { inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 },
      provider: this.name,
      model: data?.model || this.config.model,
      stopReason,
    };
  }
}

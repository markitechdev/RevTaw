import "server-only";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiMessage, AiProvider } from "@/lib/ai/types";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  model?: string;
};

function toAnthropicMessages(messages: AiMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map<AnthropicContentBlock>((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : {
                  type: "image",
                  source: { type: "base64", media_type: part.mimeType, data: part.data },
                },
          ),
  }));
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const system = options.json
      ? `${options.system ?? ""}\n\nRespond with a single JSON object and nothing else: no prose, no code fences.`.trim()
      : options.system;

    const response = await fetchWithTimeout(
      API_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
          ...(system ? { system } : {}),
          messages: toAnthropicMessages(options.messages),
        }),
      },
      options.signal,
      options.timeoutMs,
    );

    if (!response.ok) {
      throw await statusToAiError(this.name, response);
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");

    if (!text) {
      throw new AiError("invalid_output", "Anthropic returned no text content");
    }

    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      provider: this.name,
      model: data.model ?? this.model,
      stopReason: data.stop_reason,
    };
  }
}

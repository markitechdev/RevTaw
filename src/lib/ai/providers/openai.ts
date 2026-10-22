import "server-only";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiMessage, AiProvider } from "@/lib/ai/types";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";

const API_URL = "https://api.openai.com/v1/chat/completions";

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
};

function toOpenAiMessages(system: string | undefined, messages: AiMessage[]) {
  const converted = messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text" as const, text: part.text }
              : {
                  type: "image_url" as const,
                  image_url: { url: `data:${part.mimeType};base64,${part.data}` },
                },
          ),
  }));
  return system ? [{ role: "system" as const, content: system }, ...converted] : converted;
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const response = await fetchWithTimeout(
      API_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
          messages: toOpenAiMessages(options.system, options.messages),
        }),
      },
      options.signal,
      options.timeoutMs,
    );

    if (!response.ok) {
      throw await statusToAiError(this.name, response);
    }

    const data = (await response.json()) as OpenAiResponse;
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (!text) {
      throw new AiError("invalid_output", "OpenAI returned no message content");
    }

    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      provider: this.name,
      model: data.model ?? this.model,
      stopReason: choice?.finish_reason,
    };
  }
}

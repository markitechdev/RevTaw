import "server-only";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiGenerateResult, AiMessage, AiProvider } from "@/lib/ai/types";
import { fetchWithTimeout, statusToAiError } from "@/lib/ai/providers/http";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function toGeminiContents(messages: AiMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts:
      typeof message.content === "string"
        ? [{ text: message.content }]
        : message.content.map((part) =>
            part.type === "text"
              ? { text: part.text }
              : { inlineData: { mimeType: part.mimeType, data: part.data } },
          ),
  }));
}

export class GoogleProvider implements AiProvider {
  readonly name = "google";
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generate(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const url = `${API_BASE}/${encodeURIComponent(this.model)}:generateContent`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The key travels in a header, never in the URL, so it stays out of logs.
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
          contents: toGeminiContents(options.messages),
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens ?? 4096,
            ...(options.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
      options.signal,
      options.timeoutMs,
    );

    if (!response.ok) {
      throw await statusToAiError(this.name, response);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (!text) {
      throw new AiError("invalid_output", "Gemini returned no text content");
    }

    return {
      text,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      provider: this.name,
      model: this.model,
      stopReason: candidate?.finishReason,
    };
  }
}

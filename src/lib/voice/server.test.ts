import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCooldowns } from "@/lib/ai/router";
import { getServerEnv } from "@/lib/env";
import { cloudflareRunUrl, transcribeAudio, voiceCapabilities, whisperLanguage } from "@/lib/voice/server";

type Seen = { url: string; init: RequestInit };

function stubFetch(replies: Array<() => Response>) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      const next = replies.shift();
      if (!next) throw new Error("unexpected fetch " + url);
      return next();
    }),
  );
  return seen;
}

const KEYS = ["GROQ_API_KEY", "GROQ_BASE_URL", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_AI_BASE_URL"];

beforeEach(() => {
  for (const key of KEYS) vi.stubEnv(key, "");
  resetCooldowns();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const clip = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

describe("voice helpers", () => {
  it("maps BCP 47 tags to Whisper's language codes", () => {
    expect(whisperLanguage("fil-PH")).toBe("tl");
    expect(whisperLanguage("tl")).toBe("tl");
    expect(whisperLanguage("en-US")).toBe("en");
    expect(whisperLanguage("ja-JP")).toBeUndefined();
    expect(whisperLanguage(null)).toBeUndefined();
  });

  it("builds Workers AI's run URL from the account or a base override", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
    expect(cloudflareRunUrl(getServerEnv(), "@cf/openai/whisper-large-v3-turbo")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/openai/whisper-large-v3-turbo",
    );
    vi.stubEnv("CLOUDFLARE_AI_BASE_URL", "http://127.0.0.1:4010/cf/ai/v1/");
    expect(cloudflareRunUrl(getServerEnv(), "@cf/x")).toBe("http://127.0.0.1:4010/cf/ai/run/@cf/x");
  });

  it("reports what the server can do", () => {
    expect(voiceCapabilities()).toEqual({ transcribe: false });
    vi.stubEnv("GROQ_API_KEY", "gsk");
    expect(voiceCapabilities()).toEqual({ transcribe: true });
  });
});

describe("transcribeAudio", () => {
  it("sends the clip to Groq Whisper as multipart with the language and prompt", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    const seen = stubFetch([() => new Response(JSON.stringify({ text: " Buksan mo ang planner. " }), { status: 200 })]);
    const transcript = await transcribeAudio(clip, "audio/webm", "fil-PH");
    expect(transcript).toMatchObject({ text: "Buksan mo ang planner.", provider: "groq", model: "whisper-large-v3-turbo" });
    expect(seen[0].url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe("Bearer gsk-test");
    const form = seen[0].init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("tl");
    expect(String(form.get("prompt"))).toMatch(/Tamari/);
    expect((form.get("file") as File).name).toBe("speech.webm");
  });

  it("falls back to Cloudflare's Whisper when Groq is rate limited, then skips Groq while it cools down", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-test");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf-test");
    const seen = stubFetch([
      () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
      () => new Response(JSON.stringify({ result: { text: "open the planner", transcription_info: { duration: 1.4 } } }), { status: 200 }),
      () => new Response(JSON.stringify({ result: { text: "again" } }), { status: 200 }),
    ]);
    expect(await transcribeAudio(clip, "audio/webm", "en-US")).toMatchObject({ text: "open the planner", provider: "cloudflare", seconds: 1.4 });
    const body = JSON.parse(String(seen[1].init.body));
    expect(seen[1].url.endsWith("/ai/run/@cf/openai/whisper-large-v3-turbo")).toBe(true);
    expect(body).toMatchObject({ audio: Buffer.from(clip).toString("base64"), language: "en", vad_filter: true });
    expect((await transcribeAudio(clip, "audio/webm", "en-US")).provider).toBe("cloudflare");
    expect(seen).toHaveLength(3);
  });

  it("says so when nothing is configured", async () => {
    await expect(transcribeAudio(clip, "audio/webm", "en")).rejects.toMatchObject({ code: "not_configured" });
  });
});

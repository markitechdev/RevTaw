import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCooldowns } from "@/lib/ai/router";
import { getServerEnv } from "@/lib/env";
import { buildSsml, cloudflareRunUrl, escapeSsml, synthesizeSpeech, transcribeAudio, voiceCapabilities, whisperLanguage } from "@/lib/voice/server";

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

const KEYS = ["GROQ_API_KEY", "GROQ_BASE_URL", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_AI_BASE_URL", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_TTS_VOICE", "AZURE_TTS_BASE_URL"];

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

  it("escapes SSML so text can never add markup", () => {
    expect(escapeSsml(`<voice name="x">Tom & Jerry's</voice>`)).toBe("&lt;voice name=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/voice&gt;");
    expect(buildSsml("Kaya mo <yan>", "fil-PH-BlessicaNeural")).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fil-PH"><voice name="fil-PH-BlessicaNeural">Kaya mo &lt;yan&gt;</voice></speak>',
    );
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
    expect(voiceCapabilities()).toEqual({ transcribe: false, speak: false });
    vi.stubEnv("GROQ_API_KEY", "gsk");
    vi.stubEnv("AZURE_SPEECH_KEY", "az");
    vi.stubEnv("AZURE_SPEECH_REGION", "southeastasia");
    expect(voiceCapabilities()).toEqual({ transcribe: true, speak: true });
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

describe("synthesizeSpeech", () => {
  it("posts escaped SSML to Azure with the Filipino voice and MP3 output", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "az-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "southeastasia");
    const seen = stubFetch([() => new Response(new Uint8Array([0xff, 0xfb, 0x90]), { status: 200, headers: { "content-type": "audio/mpeg" } })]);
    const result = await synthesizeSpeech("Bitaw! 3 < 4 & 5 > 2");
    expect(result.voice).toBe("fil-PH-BlessicaNeural");
    expect(result.audio.byteLength).toBe(3);
    expect(seen[0].url).toBe("https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("az-key");
    expect(headers["content-type"]).toBe("application/ssml+xml");
    expect(headers["X-Microsoft-OutputFormat"]).toBe("audio-24khz-48kbitrate-mono-mp3");
    expect(String(seen[0].init.body)).toContain(">Bitaw! 3 &lt; 4 &amp; 5 &gt; 2</voice>");
  });

  it("rejects a voice name that is not a neural voice", () => {
    vi.stubEnv("AZURE_TTS_VOICE", "fil-PH-Blessica'/><evil");
    expect(() => getServerEnv()).toThrow(/neural voice name/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const adminRpc = vi.fn();
const deferred: Array<() => Promise<void>> = [];
let usageRow: { data: unknown; error: unknown } = { data: null, error: null };
const usageFilters: Array<[string, unknown]> = [];

function usageQuery() {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      usageFilters.push([column, value]);
      return chain;
    },
    maybeSingle: async () => usageRow,
  };
  return chain;
}

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => deferred.push(task) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, from: usageQuery }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));

import { AiError } from "@/lib/ai/errors";
import { checkVoiceBudget, limitMessage, MeteredProvider, parseDailyLimits, parseVoiceAllowance, recordAiTokens, usageKindForTask, voiceLimitMessage } from "@/lib/ai/quota";
import type { AiProvider } from "@/lib/ai/types";

async function flush() {
  while (deferred.length) await deferred.shift()!();
}

function provider(result: "ok" | AiError = "ok"): AiProvider {
  return {
    name: "groq",
    model: "m",
    supportsVision: false,
    generate: async () => {
      if (result !== "ok") throw result;
      return { text: "{}", usage: { inputTokens: 300, outputTokens: 40 }, provider: "groq", model: "m" };
    },
  };
}

const allowed = { data: [{ allowed: true, used: 1, daily_limit: 60, resets_at: new Date(Date.now() + 3_600_000).toISOString(), student_id: "u1" }], error: null };

beforeEach(() => {
  rpc.mockReset();
  adminRpc.mockReset();
  deferred.length = 0;
  usageRow = { data: null, error: null };
  usageFilters.length = 0;
  vi.stubEnv("AI_DAILY_LIMITS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("daily limit settings", () => {
  it("parses AI_DAILY_LIMITS and keeps defaults for the rest", () => {
    expect(parseDailyLimits(undefined)).toEqual({ chat: 60, generate: 10, study: 60, upload: 30, voice: 60 });
    expect(parseDailyLimits("chat=5, generate=2,unknown=9,study=-1,voice=abc")).toEqual({ chat: 5, generate: 2, study: 60, upload: 30, voice: 60 });
    expect(parseDailyLimits("off")).toBeNull();
  });

  it("maps tasks to allowances", () => {
    expect(usageKindForTask("tutor_reply")).toBe("chat");
    expect(usageKindForTask("generate_quiz")).toBe("generate");
    expect(usageKindForTask("ocr_image")).toBe("upload");
    expect(usageKindForTask("feynman_analyze")).toBe("study");
    expect(usageKindForTask(undefined)).toBe("study");
  });

  it("words the limit for students", () => {
    expect(limitMessage("chat", 60)).toMatch(/today's 60 Tamari messages.*midnight, Philippine time/);
    expect(limitMessage("voice", 0)).toMatch(/turned off/);
  });
});

describe("MeteredProvider", () => {
  it("takes one request, then the server records tokens after the response", async () => {
    rpc.mockResolvedValueOnce(allowed);
    adminRpc.mockResolvedValue({ data: null, error: null });
    const result = await new MeteredProvider(provider()).generate({ task: "tutor_reply", messages: [{ role: "user", content: "x" }] });
    expect(result.text).toBe("{}");
    expect(rpc).toHaveBeenCalledWith("consume_ai_request", { p_kind: "chat", p_daily_limit: 60 });
    await flush();
    // Only the server's secret key may add tokens (migration 0021), never the student's session.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(adminRpc).toHaveBeenCalledWith("add_ai_tokens", { p_user_id: "u1", p_kind: "chat", p_input_tokens: 300, p_output_tokens: 40 });
  });

  it("keeps a repair's tokens on the same student's row", async () => {
    rpc.mockResolvedValueOnce(allowed);
    adminRpc.mockResolvedValue({ data: null, error: null });
    const metered = new MeteredProvider(provider());
    await metered.generate({ task: "generate_quiz", messages: [{ role: "user", content: "x" }] });
    await metered.generate({ task: "generate_quiz", attempt: 2, messages: [{ role: "user", content: "x" }] });
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(adminRpc).toHaveBeenCalledTimes(2);
    expect(adminRpc).toHaveBeenLastCalledWith("add_ai_tokens", { p_user_id: "u1", p_kind: "generate", p_input_tokens: 300, p_output_tokens: 40 });
  });

  it("tells the provider which student the call and its repair count against", async () => {
    rpc.mockResolvedValueOnce(allowed);
    adminRpc.mockResolvedValue({ data: null, error: null });
    const seen: Array<string | undefined> = [];
    const spy: AiProvider = { ...provider(), generate: async (options) => (seen.push(options.studentId), provider().generate(options)) };
    const metered = new MeteredProvider(spy);
    await metered.generate({ task: "generate_quiz", messages: [{ role: "user", content: "x" }] });
    await metered.generate({ task: "generate_quiz", attempt: 2, messages: [{ role: "user", content: "x" }] });
    expect(seen).toEqual(["u1", "u1"]);
    // Without a counted student (limits off, scripts), nothing is passed.
    vi.stubEnv("AI_DAILY_LIMITS", "off");
    await new MeteredProvider(spy).generate({ task: "tutor_reply", messages: [{ role: "user", content: "x" }] });
    expect(seen[2]).toBeUndefined();
  });

  it("records nothing without a student or tokens", async () => {
    recordAiTokens("chat", { inputTokens: 10, outputTokens: 1 }, null);
    recordAiTokens("chat", { inputTokens: 0, outputTokens: 0 }, "u1");
    await flush();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("stops with a friendly message when the allowance is used up", async () => {
    vi.stubEnv("AI_DAILY_LIMITS", "generate=3");
    rpc.mockResolvedValueOnce({ data: [{ ...allowed.data[0], allowed: false, used: 3, daily_limit: 3 }], error: null });
    const error = await new MeteredProvider(provider())
      .generate({ task: "generate_quiz", messages: [{ role: "user", content: "x" }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "quota_exceeded", retryable: false });
    expect((error as AiError).message).toMatch(/today's 3 AI reviewers, quizzes and flashcard sets/);
    expect((error as AiError).retryAfterSeconds).toBeGreaterThan(60);
    expect(rpc).toHaveBeenCalledWith("consume_ai_request", { p_kind: "generate", p_daily_limit: 3 });
  });

  it("does not count a repair attempt", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await new MeteredProvider(provider()).generate({ task: "tutor_reply", attempt: 2, messages: [{ role: "user", content: "x" }] });
    expect(rpc).not.toHaveBeenCalledWith("consume_ai_request", expect.anything());
  });

  it("gives the request back when every provider failed", async () => {
    rpc.mockResolvedValueOnce(allowed);
    adminRpc.mockResolvedValue({ data: null, error: null });
    await expect(
      new MeteredProvider(provider(new AiError("provider_error", "500"))).generate({ task: "tutor_reply", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ code: "provider_error" });
    await flush();
    expect(adminRpc).toHaveBeenCalledWith("refund_ai_request", { p_user_id: "u1", p_kind: "chat" });
  });

  it("does not give the request back when the student canceled", async () => {
    rpc.mockResolvedValueOnce(allowed);
    const controller = new AbortController();
    controller.abort();
    await expect(
      new MeteredProvider(provider(new AiError("provider_error", "aborted"))).generate({ task: "tutor_reply", signal: controller.signal, messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ code: "provider_error" });
    await flush();
    expect(adminRpc).not.toHaveBeenCalledWith("refund_ai_request", expect.anything());
  });

  it("lets calls through when the limit table is missing, and when limits are off", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(new MeteredProvider(provider()).generate({ task: "tutor_reply", messages: [{ role: "user", content: "x" }] })).resolves.toMatchObject({ text: "{}" });
    await flush();

    rpc.mockReset();
    vi.stubEnv("AI_DAILY_LIMITS", "off");
    await new MeteredProvider(provider()).generate({ task: "tutor_reply", messages: [{ role: "user", content: "x" }] });
    await flush();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("voice budget", () => {
  // 2026-10-22 23:30 in Manila is 15:30 UTC; midnight there is 30 minutes away.
  const now = Date.parse("2026-10-22T15:30:00Z");

  it("parses seconds and characters from AI_DAILY_LIMITS", () => {
    expect(parseVoiceAllowance(undefined)).toEqual({ seconds: 1_800, characters: 20_000 });
    expect(parseVoiceAllowance("voice=40,voice_seconds=600, voice_chars=5000")).toEqual({ seconds: 600, characters: 5_000 });
    expect(parseVoiceAllowance("voice_seconds=-5,voice_chars=x")).toEqual({ seconds: 1_800, characters: 20_000 });
    expect(parseVoiceAllowance("off")).toBeNull();
    // The request limits ignore the voice budget keys.
    expect(parseDailyLimits("voice_seconds=600")).toEqual({ chat: 60, generate: 10, study: 60, upload: 30, voice: 60 });
  });

  it("words the limits for students", () => {
    expect(voiceLimitMessage("seconds", { seconds: 1_800, characters: 1 })).toMatch(/today's 30 minutes of voice typing.*Typing still works/);
    expect(voiceLimitMessage("seconds", { seconds: 90, characters: 1 })).toMatch(/today's 90 seconds/);
    expect(voiceLimitMessage("seconds", { seconds: 0, characters: 1 })).toMatch(/turned off/);
    expect(voiceLimitMessage("characters", { seconds: 1, characters: 20_000 })).toMatch(/reading aloud in Filipino/);
  });

  it("reads today's Manila row and lets the student through while under the limit", async () => {
    usageRow = { data: { input_tokens: 1_790, output_tokens: 18_000 }, error: null };
    await expect(checkVoiceBudget("u1", { seconds: true }, now)).resolves.toBeUndefined();
    await expect(checkVoiceBudget("u1", { characters: 2_000 }, now)).resolves.toBeUndefined();
    expect(usageFilters).toContainEqual(["day", "2026-10-22"]);
    expect(usageFilters).toContainEqual(["kind", "voice"]);
    expect(usageFilters).toContainEqual(["user_id", "u1"]);
  });

  it("stops voice typing once today's seconds are used, until midnight in Manila", async () => {
    usageRow = { data: { input_tokens: 1_800, output_tokens: 0 }, error: null };
    const error = await checkVoiceBudget("u1", { seconds: true }, now).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "quota_exceeded", retryable: false, retryAfterSeconds: 1_800 });
    expect((error as AiError).message).toMatch(/30 minutes of voice typing/);
  });

  it("stops reading aloud when the next piece would pass today's characters", async () => {
    usageRow = { data: { input_tokens: 0, output_tokens: 19_500 }, error: null };
    await expect(checkVoiceBudget("u1", { characters: 600 }, now)).rejects.toMatchObject({ code: "quota_exceeded" });
    await expect(checkVoiceBudget("u1", { characters: 500 }, now)).resolves.toBeUndefined();
  });

  it("lets the call through when the row can't be read, and when limits are off", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    usageRow = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    await expect(checkVoiceBudget("u1", { seconds: true }, now)).resolves.toBeUndefined();
    vi.stubEnv("AI_DAILY_LIMITS", "off");
    usageRow = { data: { input_tokens: 99_999, output_tokens: 99_999 }, error: null };
    await expect(checkVoiceBudget("u1", { seconds: true }, now)).resolves.toBeUndefined();
  });
});

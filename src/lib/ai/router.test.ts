import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiBudgetError, AiError } from "@/lib/ai/errors";
import { AiRouter, cooldownFor, coolingDownUntil, recentRoutes, resetCooldowns } from "@/lib/ai/router";
import type { AiGenerateOptions, AiProvider } from "@/lib/ai/types";

type Behavior = "ok" | AiError | (() => never);

function fake(name: string, behaviors: Behavior[], extra: Partial<AiProvider> = {}) {
  const calls: AiGenerateOptions[] = [];
  const provider: AiProvider = {
    name,
    model: `${name}-model`,
    supportsVision: false,
    async generate(options) {
      calls.push(options);
      const next = behaviors.shift() ?? "ok";
      if (next === "ok") return { text: `from ${name}`, usage: { inputTokens: 1, outputTokens: 1 }, provider: name, model: `${name}-model` };
      if (typeof next === "function") return next();
      throw next;
    },
    ...extra,
  };
  return { provider, calls };
}

const ask: AiGenerateOptions = { task: "tutor_reply", messages: [{ role: "user", content: "Hi" }] };

beforeEach(() => {
  resetCooldowns();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AiRouter", () => {
  it("uses the first provider when it answers", async () => {
    const groq = fake("groq", ["ok"]);
    const cloudflare = fake("cloudflare", ["ok"]);
    const result = await new AiRouter([groq.provider, cloudflare.provider]).generate(ask);
    expect(result.provider).toBe("groq");
    expect(cloudflare.calls).toHaveLength(0);
  });

  it("falls back on a 429 and skips the cooling provider on the next call", async () => {
    const groq = fake("groq", [new AiError("rate_limited", "429", true, { retryAfterSeconds: 30 })]);
    const cloudflare = fake("cloudflare", ["ok", "ok"]);
    const router = new AiRouter([groq.provider, cloudflare.provider]);

    expect((await router.generate(ask)).provider).toBe("cloudflare");
    expect(coolingDownUntil(groq.provider)).not.toBeNull();
    expect((await router.generate(ask)).provider).toBe("cloudflare");
    expect(groq.calls).toHaveLength(1);
    expect(recentRoutes()[0].attempts.map((attempt) => `${attempt.provider}:${attempt.outcome}`)).toEqual(["groq:skipped", "cloudflare:ok"]);
  });

  it("does not cool a provider down for a request-specific failure", async () => {
    const groq = fake("groq", [new AiError("content_too_large", "413", false), "ok"]);
    const cloudflare = fake("cloudflare", ["ok"]);
    const router = new AiRouter([groq.provider, cloudflare.provider]);
    expect((await router.generate(ask)).provider).toBe("cloudflare");
    expect(coolingDownUntil(groq.provider)).toBeNull();
    expect((await router.generate(ask)).provider).toBe("groq");
  });

  it("skips providers whose budget the request exceeds", async () => {
    const groq = fake("groq", ["ok"], { fits: () => false });
    const cloudflare = fake("cloudflare", ["ok"]);
    expect((await new AiRouter([groq.provider, cloudflare.provider]).generate(ask)).provider).toBe("cloudflare");
    expect(groq.calls).toHaveLength(0);
  });

  it("sends images only to providers that can read them", async () => {
    const groq = fake("groq", ["ok"]);
    const cloudflare = fake("cloudflare", ["ok"], { supportsVision: true });
    const router = new AiRouter([groq.provider, cloudflare.provider]);
    expect(router.supportsVision).toBe(true);
    const result = await router.generate({ messages: [{ role: "user", content: [{ type: "image", mimeType: "image/png", data: "AA" }] }] });
    expect(result.provider).toBe("cloudflare");
    expect(groq.calls).toHaveLength(0);
  });

  it("throws the last provider error when every provider fails", async () => {
    const groq = fake("groq", [new AiError("provider_error", "500")]);
    const cloudflare = fake("cloudflare", [new AiError("rate_limited", "429")]);
    await expect(new AiRouter([groq.provider, cloudflare.provider]).generate(ask)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("explains when nothing could be tried", async () => {
    const groq = fake("groq", [], { fits: () => false });
    await expect(new AiRouter([groq.provider]).generate(ask)).rejects.toMatchObject({ code: "content_too_large" });
    const vision = fake("groq", []);
    await expect(
      new AiRouter([vision.provider]).generate({ messages: [{ role: "user", content: [{ type: "image", mimeType: "image/png", data: "AA" }] }] }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("passes the remaining time to each provider", async () => {
    const groq = fake("groq", ["ok"]);
    await new AiRouter([groq.provider], { deadlineMs: 30_000 }).generate(ask);
    expect(groq.calls[0].timeoutMs).toBeGreaterThan(25_000);
    expect(groq.calls[0].timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it("gives each provider its own limit, so a stalled one leaves time for the next", async () => {
    const groq = fake("groq", [new AiError("provider_error", "timed out", true)], { timeoutMs: 45_000 });
    const cloudflare = fake("cloudflare", ["ok"], { timeoutMs: 100_000 });
    await new AiRouter([groq.provider, cloudflare.provider]).generate(ask);
    expect(groq.calls[0].timeoutMs).toBe(45_000);
    // Groq failed at once, so Cloudflare still has its full 100 seconds within the 110.
    expect(cloudflare.calls[0].timeoutMs).toBe(100_000);
    const plain = fake("plain", ["ok"]);
    await new AiRouter([plain.provider]).generate(ask);
    expect(plain.calls[0].timeoutMs).toBe(90_000);
  });

  it("never runs past the request's own deadline", async () => {
    const groq = fake("groq", ["ok"], { timeoutMs: 45_000 });
    await new AiRouter([groq.provider]).generate({ ...ask, deadline: Date.now() + 20_000 });
    expect(groq.calls[0].timeoutMs).toBeLessThanOrEqual(20_000);
    const late = fake("groq", ["ok"]);
    await expect(new AiRouter([late.provider]).generate({ ...ask, deadline: Date.now() + 1_000 })).rejects.toMatchObject({ code: "rate_limited" });
    expect(late.calls).toHaveLength(0);
  });

  it("moves past a provider whose token budget turns the call away, without cooling it down", async () => {
    const groq = fake("groq", [], { fits: () => false });
    const ollama = fake("ollama_cloud", [new AiBudgetError("student", "ollama_cloud", "ollama_cloud student budget: 9000 used + 1500 needed > 10000"), "ok"]);
    const anthropic = fake("anthropic", ["ok"]);
    const router = new AiRouter([groq.provider, ollama.provider, anthropic.provider]);
    expect((await router.generate(ask)).provider).toBe("anthropic");
    expect(recentRoutes()[0].attempts.map((attempt) => `${attempt.provider}:${attempt.reason ?? attempt.outcome}`)).toEqual([
      "groq:too large",
      "ollama_cloud:budget: student",
      "anthropic:ok",
    ]);
    expect(coolingDownUntil(ollama.provider)).toBeNull();
    // Another student (or the same one later) still reaches it.
    expect((await router.generate(ask)).provider).toBe("ollama_cloud");
  });

  it("explains a request only the budgeted provider could take as too large, and otherwise gives the budget's reason", async () => {
    const turnedAway = () => new AiBudgetError("total", "ollama_cloud", "ollama_cloud total budget: 99000 used + 1500 needed > 100000");
    const groq = fake("groq", [], { fits: () => false });
    const ollama = fake("ollama_cloud", [turnedAway(), turnedAway()]);
    await expect(new AiRouter([groq.provider, ollama.provider]).generate(ask)).rejects.toMatchObject({ code: "content_too_large" });
    const alone = await new AiRouter([ollama.provider]).generate(ask).catch((error: unknown) => error);
    expect(alone).toBeInstanceOf(AiBudgetError);
    expect((alone as AiError).message).toMatch(/reached its limit/);
  });

  it("prefers a busy provider's error to a budget, since retrying soon helps", async () => {
    const groq = fake("groq", [new AiError("rate_limited", "429", true, { retryAfterSeconds: 30 })]);
    const ollama = fake("ollama_cloud", [new AiBudgetError("student", "ollama_cloud", "used")]);
    await expect(new AiRouter([groq.provider, ollama.provider]).generate(ask)).rejects.toMatchObject({ code: "rate_limited" });
    const ollamaAgain = fake("ollama_cloud", [new AiBudgetError("student", "ollama_cloud", "used")]);
    // Groq is cooling down now: still "busy", not the budget.
    await expect(new AiRouter([groq.provider, ollamaAgain.provider]).generate(ask)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("lets programming errors through instead of trying the next provider", async () => {
    const groq = fake("groq", [() => {
      throw new TypeError("bug");
    }]);
    const cloudflare = fake("cloudflare", ["ok"]);
    await expect(new AiRouter([groq.provider, cloudflare.provider]).generate(ask)).rejects.toThrow(TypeError);
    expect(cloudflare.calls).toHaveLength(0);
  });
});

describe("cooldownFor", () => {
  it("honours Retry-After within bounds and backs off longer for bad keys", () => {
    expect(cooldownFor(new AiError("rate_limited", "", true, { retryAfterSeconds: 2 }))).toBe(15_000);
    expect(cooldownFor(new AiError("rate_limited", "", true, { retryAfterSeconds: 90 }))).toBe(90_000);
    expect(cooldownFor(new AiError("rate_limited", "", true, { retryAfterSeconds: 86_400 }))).toBe(3_600_000);
    expect(cooldownFor(new AiError("rate_limited"))).toBe(300_000);
    expect(cooldownFor(new AiError("not_configured"))).toBe(1_800_000);
    expect(cooldownFor(new AiError("provider_error", "", true))).toBe(300_000);
    expect(cooldownFor(new AiError("provider_error", "", false))).toBeNull();
    expect(cooldownFor(new AiError("invalid_output"))).toBeNull();
  });
});

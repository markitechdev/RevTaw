import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let adminAvailable = true;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (adminAvailable ? { rpc } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { localRateLimit, rateLimit, resetRateLimits } = await import("@/lib/rate-limit");

beforeEach(() => {
  rpc.mockReset();
  adminAvailable = true;
  resetRateLimits();
});

describe("localRateLimit", () => {
  it("allows up to the limit in a window, then reports when to retry", () => {
    const now = 1_000_000;
    expect(localRateLimit("k", 2, 60_000, now).ok).toBe(true);
    expect(localRateLimit("k", 2, 60_000, now + 1).ok).toBe(true);
    const third = localRateLimit("k", 2, 60_000, now + 1000);
    expect(third).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 59 });
    expect(localRateLimit("k", 2, 60_000, now + 60_001).ok).toBe(true);
  });
});

describe("rateLimit (shared)", () => {
  it("counts in the database with a hashed key", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, hits: 3, retry_after_seconds: 40 }], error: null });
    const result = await rateLimit("login:email:student@example.com", 8, 15 * 60_000);
    expect(result).toEqual({ ok: true, remaining: 5, retryAfterSeconds: 0 });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("rate_limit_hit");
    expect(args).toMatchObject({ p_limit: 8, p_window_seconds: 900 });
    expect(args.p_key).not.toContain("student@example.com");
    expect(args.p_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("refuses past the limit with the database's retry time", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, hits: 9, retry_after_seconds: 120 }], error: null });
    expect(await rateLimit("k", 8, 60_000)).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 120 });
  });

  it("falls back to this instance's counter when the database errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function rate_limit_hit does not exist" } });
    expect((await rateLimit("k", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("k", 1, 60_000)).ok).toBe(false);
  });

  it("falls back when the call throws or no secret key is configured", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect((await rateLimit("a", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("a", 1, 60_000)).ok).toBe(false);
    adminAvailable = false;
    expect((await rateLimit("b", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("b", 1, 60_000)).ok).toBe(false);
  });
});

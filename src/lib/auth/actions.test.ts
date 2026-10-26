import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One request's cookies, read and written like a Server Action's.
const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
  getAll: () => [...jar.entries()].map(([name, { value }]) => ({ name, value })),
  set: (name: string, value: string, options: Record<string, unknown> = {}) => void jar.set(name, { value, options }),
  delete: (name: string) => void jar.delete(name),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
// No database: the rate limits count in this process.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/security/turnstile", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
const signUp = vi.fn();
const resend = vi.fn();
const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/auth-client", () => ({ createAuthClient: async () => ({ signUp, resend, signInWithPassword }) }));

const { loginAction, registerAction, resendVerificationAction } = await import("@/lib/auth/actions");
const { getPendingVerification, setPendingEmail } = await import("@/lib/auth/pending-email");
const { resetRateLimits } = await import("@/lib/rate-limit");
const { IDLE_STATE } = await import("@/lib/forms/action-state");

const now = 1_800_000_000_000;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const registration = () => form({ displayName: "Ana Reyes", email: "ana@example.com", password: "RevTaw-Study-2026", agree: "yes" });

async function register() {
  await expect(registerAction(IDLE_STATE, registration())).rejects.toThrow("NEXT_REDIRECT /verify-email");
}

beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  jar.clear();
  resetRateLimits();
  signUp.mockReset().mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
  resend.mockReset().mockResolvedValue({ data: {}, error: null });
  signInWithPassword.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("verification emails: one a minute per address", () => {
  it("starts the minute at sign-up: the page counts it down and an early resend is refused with the seconds left", async () => {
    await register();
    expect(await getPendingVerification()).toEqual({ email: "ana@example.com", resendAt: now + 60_000, resendInSeconds: 60 });

    vi.setSystemTime(now + 20_000);
    expect((await getPendingVerification())?.resendInSeconds).toBe(40);
    expect(await resendVerificationAction(IDLE_STATE, new FormData())).toEqual({
      status: "error",
      message: "We just sent an email to that address. You can ask for another one in 40 seconds.",
    });
    expect(resend).not.toHaveBeenCalled();
    expect((await getPendingVerification())?.resendAt).toBe(now + 60_000);
  });

  it("sends a resend once the minute is over, and starts the next minute", async () => {
    await register();
    vi.setSystemTime(now + 61_000);
    const sent = await resendVerificationAction(IDLE_STATE, new FormData());
    expect(sent).toEqual({ status: "success", message: "If ana@example.com is registered and not yet verified, a new link is on its way." });
    expect(resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "ana@example.com" }));
    expect(await getPendingVerification()).toMatchObject({ resendAt: now + 121_000, resendInSeconds: 60 });

    vi.setSystemTime(now + 76_000);
    expect(await resendVerificationAction(IDLE_STATE, new FormData())).toMatchObject({ status: "error", message: expect.stringContaining("in 45 seconds") });
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("gives an address typed on the page the same minute after its email", async () => {
    expect((await resendVerificationAction(IDLE_STATE, form({ email: " Ben@Example.com " }))).status).toBe("success");
    expect(await getPendingVerification()).toMatchObject({ email: "ben@example.com", resendInSeconds: 60 });
    expect((await resendVerificationAction(IDLE_STATE, form({ email: "ben@example.com" }))).status).toBe("error");
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("answers the same when Supabase sends nothing, and still waits the minute", async () => {
    resend.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429 } });
    const answer = await resendVerificationAction(IDLE_STATE, form({ email: "ana@example.com" }));
    expect(answer.status).toBe("success");
    expect((await getPendingVerification())?.resendInSeconds).toBe(60);
  });

  it("keeps the wait when an unverified account signs in (nothing is sent), and gives another address none", async () => {
    await register();
    vi.setSystemTime(now + 10_000);
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", status: 400 } });
    await expect(loginAction(IDLE_STATE, form({ email: "ana@example.com", password: "RevTaw-Study-2026" }))).rejects.toThrow("NEXT_REDIRECT /verify-email?reason=unconfirmed");
    expect(await getPendingVerification()).toMatchObject({ email: "ana@example.com", resendInSeconds: 50 });

    await setPendingEmail("ben@example.com");
    expect(await getPendingVerification()).toMatchObject({ email: "ben@example.com", resendAt: null, resendInSeconds: 0 });
  });

  it("keeps the cookie on the server's side: HttpOnly, SameSite=Lax, 15 minutes", async () => {
    await register();
    expect(jar.get("revtaw-pending-email")?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
  });
});

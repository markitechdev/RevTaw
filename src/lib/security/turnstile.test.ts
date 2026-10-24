import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let forwardedFor = "203.0.113.7, 10.0.0.1";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { TURNSTILE_MESSAGES, resetTurnstileReports, turnstileSiteKey, turnstileState, verifyTurnstile } = await import("@/lib/security/turnstile");

const SITE_KEY = "1x00000000000000000000AA";
const SECRET = "1x0000000000000000000000000000000AA";

const fetchMock = vi.fn();

function form(token?: string): FormData {
  const data = new FormData();
  data.set("email", "student@example.com");
  if (token !== undefined) data.set("cf-turnstile-response", token);
  return data;
}

function answer(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function sentBody(): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0];
  return new URLSearchParams(init.body as URLSearchParams);
}

beforeEach(() => {
  forwardedFor = "203.0.113.7, 10.0.0.1";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetTurnstileReports();
  vi.stubEnv("TURNSTILE_SITE_KEY", SITE_KEY);
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
  vi.stubEnv("TURNSTILE_VERIFY_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("passes everything while Turnstile is off", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile(form(), "login")).toEqual({ ok: true });
    expect(await turnstileSiteKey()).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when only one of the two keys is set, and says so once", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile(form("token"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.unavailable });
    expect(await verifyTurnstile(form("token"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.unavailable });
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    expect((await verifyTurnstile(form("token"), "login")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("asks for the check when the form has no token, without calling Cloudflare", async () => {
    expect(await verifyTurnstile(form(), "register")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.missing });
    expect(await verifyTurnstile(form(""), "register")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.missing });
    expect(await verifyTurnstile(form("x".repeat(2049)), "register")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.rejected });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms the token with siteverify, sending the secret and the student's address", async () => {
    answer({ success: true, "error-codes": [], action: "login", hostname: "revtaw.com" });
    expect(await verifyTurnstile(form("tok-1"), "login")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    const body = sentBody();
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("tok-1");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("leaves out an address that is not an IP literal, and uses the local stand-in in tests", async () => {
    forwardedFor = "";
    vi.stubEnv("TURNSTILE_VERIFY_URL", "http://127.0.0.1:4020/siteverify");
    answer({ success: true, "error-codes": [] });
    expect((await verifyTurnstile(form("tok"), "forgot")).ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:4020/siteverify");
    expect(sentBody().has("remoteip")).toBe(false);
  });

  it("rejects used, expired or invalid tokens and tokens solved for another form", async () => {
    answer({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verifyTurnstile(form("tok"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.rejected });
    answer({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await verifyTurnstile(form("tok"), "login")).ok).toBe(false);
    answer({ success: true, "error-codes": [], action: "forgot" });
    expect(await verifyTurnstile(form("tok"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.rejected });
    // Cloudflare's test keys answer without an action.
    answer({ success: true, "error-codes": [], action: "" });
    expect((await verifyTurnstile(form("tok"), "resend")).ok).toBe(true);
  });

  it("fails closed when Cloudflare cannot be reached or does not accept the secret", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await verifyTurnstile(form("tok"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.unavailable });
    answer({ error: "busy" }, 503);
    expect((await verifyTurnstile(form("tok"), "login")).ok).toBe(false);
    answer({ unexpected: true });
    expect((await verifyTurnstile(form("tok"), "login")).ok).toBe(false);
    answer({ success: false, "error-codes": ["internal-error"] });
    expect(await verifyTurnstile(form("tok"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.unavailable });
    answer({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await verifyTurnstile(form("tok"), "login")).toEqual({ ok: false, message: TURNSTILE_MESSAGES.unavailable });
    expect(vi.mocked(console.error).mock.calls.some(([line]) => String(line).includes("TURNSTILE_SECRET_KEY"))).toBe(true);
    // Nothing secret is logged.
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET);
  });
});

describe("turnstileSiteKey and turnstileState", () => {
  it("gives the pages the public site key while Turnstile is on", async () => {
    expect(await turnstileSiteKey()).toBe(SITE_KEY);
    expect(turnstileState()).toBe("on");
  });

  it("reports one missing key as incomplete", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "  ");
    expect(turnstileState()).toBe("incomplete");
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    expect(turnstileState()).toBe("off");
  });
});

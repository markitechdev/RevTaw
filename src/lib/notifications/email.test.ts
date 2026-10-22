import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/notifications/email";
import { emailConfig } from "@/lib/notifications/email-config";
import { unsubscribeHeaders, unsubscribeUrl, verifyUnsubscribe } from "@/lib/notifications/unsubscribe";

const message = { to: "ana@example.com", subject: "Reminder: Bio", text: "Bio", html: "<p>Bio</p>" };
const resend = { provider: "resend" as const, from: "RevTaw <r@example.com>", apiKey: "re_test_key", apiUrl: "https://api.resend.com" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("refuses when no provider is configured", async () => {
    expect(await sendEmail(message, null)).toEqual({ ok: false, error: "Email is not configured." });
  });

  it("posts to Resend with the key in the header only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(message, resend);
    expect(result).toEqual({ ok: true, id: "1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ from: "RevTaw <r@example.com>", to: ["ana@example.com"], subject: "Reminder: Bio", text: "Bio", html: "<p>Bio</p>" });
    expect(String(init.body)).not.toContain("re_test_key");
  });

  it("sends the idempotency key and unsubscribe headers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({ ...message, idempotencyKey: "digest-u1-2026-10-22", headers: { "List-Unsubscribe": "<https://x/u>" } }, resend);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("digest-u1-2026-10-22");
    expect(JSON.parse(String(init.body)).headers).toEqual({ "List-Unsubscribe": "<https://x/u>" });
  });

  it("reports provider errors without the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })));
    const result = await sendEmail(message, { ...resend, apiKey: "re_secret", from: "r@example.com" });
    expect(result).toEqual({ ok: false, error: "Resend 401: Invalid API key" });
    expect(JSON.stringify(result)).not.toContain("re_secret");
  });
});

describe("emailConfig", () => {
  it("needs only the Resend key and a sender, and refuses SMTP", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("EMAIL_FROM", "RevTaw <r@mail.example.com>");
    vi.stubEnv("RESEND_API_URL", "");
    expect(emailConfig()).toEqual({ provider: "resend", from: "RevTaw <r@mail.example.com>", apiKey: "re_x", apiUrl: "https://api.resend.com" });
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    expect(emailConfig()).toBeNull();
  });
});

describe("unsubscribe links", () => {
  it("sign the student and the kind, and fail for anyone else", () => {
    vi.stubEnv("CRON_SECRET", "a-long-test-cron-secret-123");
    const url = unsubscribeUrl("https://revtaw.example", "11111111-1111-1111-1111-111111111111", "reminders");
    expect(url).toMatch(/^https:\/\/revtaw\.example\/api\/email\/unsubscribe\?u=11111111-1111-1111-1111-111111111111&k=reminders&t=[\w-]{43}$/);
    const token = new URL(url!).searchParams.get("t")!;
    expect(verifyUnsubscribe("11111111-1111-1111-1111-111111111111", "reminders", token)).toBe(true);
    expect(verifyUnsubscribe("22222222-2222-2222-2222-222222222222", "reminders", token)).toBe(false);
    expect(verifyUnsubscribe("11111111-1111-1111-1111-111111111111", "reminders", token.slice(1) + "A")).toBe(false);
    expect(unsubscribeHeaders(url)).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("are off without a scheduler secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(unsubscribeUrl("https://revtaw.example", "u", "reminders")).toBeNull();
    expect(unsubscribeHeaders(null)).toBeUndefined();
  });
});

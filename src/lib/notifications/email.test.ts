import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/notifications/email";

const message = { to: "ana@example.com", subject: "Reminder: Bio", text: "Bio", html: "<p>Bio</p>" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("refuses when no provider is configured", async () => {
    expect(await sendEmail(message, null)).toEqual({ ok: false, error: "Email is not configured." });
  });

  it("posts to Resend with the key in the header only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(message, { provider: "resend", from: "RevTaw <r@example.com>", apiKey: "re_test_key" });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ from: "RevTaw <r@example.com>", to: ["ana@example.com"], subject: "Reminder: Bio", text: "Bio", html: "<p>Bio</p>" });
    expect(String(init.body)).not.toContain("re_test_key");
  });

  it("reports provider errors without the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })));
    const result = await sendEmail(message, { provider: "resend", from: "r@example.com", apiKey: "re_secret" });
    expect(result).toEqual({ ok: false, error: "Resend 401: Invalid API key" });
    expect(JSON.stringify(result)).not.toContain("re_secret");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendWelcomeEmail } from "@/lib/notifications/welcome";

const { sendEmail, configured } = vi.hoisted(() => ({ sendEmail: vi.fn(), configured: { value: true } }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail }));
vi.mock("@/lib/notifications/email-config", () => ({ isEmailConfigured: () => configured.value }));
vi.mock("@/lib/env", () => ({ getPublicSiteUrl: () => "https://revtaw.example" }));

describe("welcome email", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ ok: true, id: "sent" });
    configured.value = true;
  });

  it("welcomes the student by first name, once per account", async () => {
    await sendWelcomeEmail({ id: "u1", email: "ana@example.com" }, "Ana Cruz");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sendEmail.mock.calls[0];
    expect(message).toMatchObject({ to: "ana@example.com", subject: "Welcome to RevTaw", idempotencyKey: "welcome-u1" });
    expect(message.text).toContain("Hi Ana,");
    expect(message.text).toContain("Start Studying: https://revtaw.example/dashboard");
    expect(message.html).toContain('src="https://revtaw.example/email/icon-sparkles.png"');
  });

  it("does nothing without an address or without email set up", async () => {
    await sendWelcomeEmail({ id: "u1", email: null }, "Ana");
    configured.value = false;
    await sendWelcomeEmail({ id: "u1", email: "ana@example.com" }, "Ana");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("logs a failed send instead of throwing", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "Resend 500: down" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendWelcomeEmail({ id: "u1", email: "ana@example.com" }, null)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("welcome: email failed", "Resend 500: down");
    log.mockRestore();
  });
});

import { describe, expect, it } from "vitest";

import { EMAIL_SAMPLES } from "@/lib/email/samples";

describe("every RevTaw email", () => {
  it("covers each kind of email", () => {
    expect(EMAIL_SAMPLES.map((sample) => sample.id)).toEqual([
      "confirm-signup",
      "reset-password",
      "change-email",
      "password-changed",
      "study-reminder",
      "study-reminder-later",
      "planner-task",
      "planner-class",
      "daily-exam",
      "daily-reviews",
      "daily-plan",
      "welcome",
      "notification",
    ]);
  });

  it.each(EMAIL_SAMPLES.map((sample) => [sample.id, sample] as const))("%s uses the shared design and is email-safe", (_id, sample) => {
    const { html, text } = sample.render("https://revtaw.example");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<span lang="fil">Reviewer Na May Bitaw</span>');
    expect(html).toContain("MARK FRANCIS ENTREDICHO");
    expect(html).toContain("Need help? Contact us at");
    expect(html).toMatch(/<h1 class="rt-title rt-ink"/);
    expect(html).not.toMatch(/<script|<link |javascript:|<iframe|<form|<svg|\{\{/i);
    for (const image of html.match(/<img [^>]*>/g) ?? []) expect(image).toMatch(/^<img src="https:\/\/revtaw\.example\/email\/[a-z-]+\.png" width="\d+" height="\d+" alt=""/);
    for (const table of html.match(/<table [^>]*>/g) ?? []) expect(table).toContain('role="presentation"');
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).toMatch(/^(https:\/\/|mailto:)/);
    expect(Buffer.byteLength(html)).toBeLessThan(40_000);
    if (text !== null) {
      expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(text).toContain("Need help? Contact us at support@revtaw.com");
    }
  });

  it("lets students stop reminder and daily emails, and only those", () => {
    for (const sample of EMAIL_SAMPLES) {
      const { html } = sample.render("https://revtaw.example");
      const optional = sample.group === "Planner reminders" || sample.group === "Daily email";
      expect(html.includes("/api/email/unsubscribe"), sample.id).toBe(optional);
    }
  });
});

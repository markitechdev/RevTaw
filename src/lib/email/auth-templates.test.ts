import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SUPABASE_TEMPLATES, supabaseTemplateHtml } from "@/lib/email/auth-templates";

/**
 * supabase/templates holds the HTML pasted into the Supabase dashboard. After changing an email's design or
 * words, write the files again with:
 *
 *   UPDATE_EMAIL_TEMPLATES=1 npx vitest run src/lib/email/auth-templates.test.ts
 *   ($env:UPDATE_EMAIL_TEMPLATES=1; npx vitest run src/lib/email/auth-templates.test.ts   in PowerShell)
 *
 * and paste the changed ones into the dashboard again.
 */
const DIR = "supabase/templates";
const update = process.env.UPDATE_EMAIL_TEMPLATES === "1";

describe("Supabase email templates", () => {
  if (update) mkdirSync(DIR, { recursive: true });

  it.each(SUPABASE_TEMPLATES.map((template) => [template.file, template] as const))("%s matches the design system", (file, template) => {
    const html = supabaseTemplateHtml(template);
    if (update) writeFileSync(`${DIR}/${file}`, html);
    expect(existsSync(`${DIR}/${file}`), `${DIR}/${file} is missing: run UPDATE_EMAIL_TEMPLATES=1 npx vitest run src/lib/email/auth-templates.test.ts`).toBe(true);
    expect(readFileSync(`${DIR}/${file}`, "utf8"), `${DIR}/${file} is out of date: run UPDATE_EMAIL_TEMPLATES=1 npx vitest run src/lib/email/auth-templates.test.ts`).toBe(html);
  });

  it("links to RevTaw's confirm page with the token hash, never Supabase's one-click link", () => {
    const html = Object.fromEntries(SUPABASE_TEMPLATES.map((template) => [template.file, supabaseTemplateHtml(template)]));
    expect(html["confirm-signup.html"]).toContain('href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup"');
    expect(html["reset-password.html"]).toContain('href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery"');
    expect(html["change-email.html"]).toContain('href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email_change"');
    expect(html["change-email.html"]).toContain("from {{ .Email }} to {{ .NewEmail }}");
    expect(html["password-changed.html"]).toContain('href="{{ .SiteURL }}/forgot-password"');
    for (const page of Object.values(html)) {
      expect(page).not.toContain("ConfirmationURL");
      // Only placeholders Supabase fills in for these templates.
      expect(page.match(/\{\{[^}]*\}\}/g)?.every((placeholder) => /^\{\{ \.(SiteURL|TokenHash|Email|NewEmail) \}\}$/.test(placeholder))).toBe(true);
      expect(page).toContain('src="{{ .SiteURL }}/email/logo.png"');
    }
  });

  it("names a subject for each", () => {
    expect(SUPABASE_TEMPLATES.map((template) => [template.name, template.content.subject])).toEqual([
      ["Confirm sign up", "Confirm your RevTaw account"],
      ["Reset password", "Reset your RevTaw password"],
      ["Change email address", "Confirm your new RevTaw email"],
      ["Password changed", "Your RevTaw password was changed"],
    ]);
  });
});

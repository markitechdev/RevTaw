import { describe, expect, it } from "vitest";

import { EMAIL_ICONS, renderEmail, siteEmailOptions, type EmailContent } from "@/lib/email/render";

const content: EmailContent = {
  subject: "Reset your RevTaw password",
  preheader: "Choose a new password.",
  icon: "lock",
  greeting: "Hi there,",
  title: "Reset your password",
  titleAccent: "password",
  paragraphs: ["We received a request to reset your password."],
  details: [{ label: "Account", value: "ana@example.com" }],
  button: { label: "Reset Password", href: "https://revtaw.example/auth/confirm?token_hash=abc&type=recovery" },
  buttonNote: "This link will expire in 1 hour for your security.",
  showLink: true,
  sections: [{ title: "Also today", items: ["12 cards to review"], link: { label: "Start reviewing", href: "https://revtaw.example/flashcards/review" } }],
  notice: { icon: "shield", title: "Didn't request this?", body: "You can safely ignore this email." },
  reason: "You get this email because you asked for it.",
  unsubscribe: { label: "Stop these emails", href: "https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x" },
};

const options = siteEmailOptions("https://revtaw.example/");

describe("renderEmail", () => {
  const { html, text, subject, preheader } = renderEmail(content, options);

  it("has RevTaw's header and footer", () => {
    expect(html).toContain('<span class="rt-ink" style="color:#002858;">Rev</span><span class="rt-accent" style="color:#1C69E3;">Taw</span>');
    expect(html).toContain('<span lang="fil">Reviewer Na May Bitaw</span>');
    expect(html).toContain("Developed by: <span style=\"letter-spacing:0.4px;\">MARK FRANCIS ENTREDICHO</span>");
    expect(html).toContain('href="mailto:support@revtaw.com"');
    expect(html).toContain('href="https://revtaw.example" target="_blank" rel="noopener" style="color:#1C69E3;text-decoration:underline;">revtaw.example</a>');
    expect(html).toContain("&copy; RevTaw.");
  });

  it("shows the title with its blue accent, the text, details, button, note, link, lists and notice", () => {
    expect(html).toContain('Reset your <span class="rt-accent" style="color:#1C69E3;white-space:nowrap;">password</span></h1>');
    expect(html).toContain("We received a request to reset your password.");
    expect(html).toContain(">Account</td>");
    expect(html).toContain('href="https://revtaw.example/auth/confirm?token_hash=abc&amp;type=recovery"');
    expect(html).toContain('Reset Password&nbsp;<span aria-hidden="true">&rarr;</span></a>');
    expect(html).toContain("This link will expire in 1 hour for your security.");
    expect(html).toContain("Button not working? Copy this link into your browser:");
    expect(html).toContain("12 cards to review</li>");
    expect(html).toContain("Didn&#39;t request this?");
    expect(html).toContain("Stop these emails</a>");
  });

  it("puts the preheader first, hidden", () => {
    expect(preheader).toBe("Choose a new password.");
    expect(html).toMatch(/<div style="display:none;[^"]*">Choose a new password\./);
    expect(subject).toBe("Reset your RevTaw password");
    expect(html).toContain("<title>Reset your RevTaw password</title>");
  });

  it("loads the logo and the type icons from the site, at fixed sizes with empty alt text", () => {
    expect(html).toContain('src="https://revtaw.example/email/logo.png" width="36" height="36" alt=""');
    expect(html).toContain('src="https://revtaw.example/email/icon-lock.png" width="48" height="48" alt=""');
    expect(html).toContain('src="https://revtaw.example/email/icon-shield.png" width="40" height="40" alt=""');
    for (const image of html.match(/<img [^>]*>/g) ?? []) {
      expect(image).toMatch(/ width="\d+" height="\d+" alt=""/);
    }
  });

  it("leaves images out without a site address", () => {
    const rendered = renderEmail(content, siteEmailOptions(null));
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("Rev</span>");
  });

  it("is email-safe: tables for layout, no scripts or outside styles, dark and phone styles in their own blocks", () => {
    expect(html).not.toMatch(/<script|<link |javascript:|<iframe|<form|<svg/i);
    for (const table of html.match(/<table [^>]*>/g) ?? []) expect(table).toContain('role="presentation"');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    // Base and phone styles, dark styles, Outlook.com dark styles, and Outlook's font fallback.
    expect(html.match(/<style>/g)).toHaveLength(4);
    expect(html).toContain("@media only screen and (max-width:620px)");
    expect(html).toContain("@media (prefers-color-scheme:dark)");
    expect(html).toContain("[data-ogsc] .rt-ink");
    expect(html).toContain("<!--[if mso]>");
    // Gmail cuts messages off after 102 KB.
    expect(Buffer.byteLength(html)).toBeLessThan(40_000);
  });

  it("escapes everything that comes from content", () => {
    const evil = renderEmail(
      {
        ...content,
        title: '<img src=x onerror="alert(1)">',
        titleAccent: null,
        paragraphs: ["Bring <b>data</b> & charts"],
        details: [{ label: "<i>", value: "'quoted'" }],
        button: { label: "Go <now>", href: 'https://revtaw.example/"><script>alert(1)</script>' },
        notice: { title: "<u>", body: "<s>" },
      },
      options,
    ).html;
    expect(evil).not.toMatch(/<img src=x|<b>|<script>|<u>|<s>|<i>/);
    expect(evil).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(evil).toContain("Bring &lt;b&gt;data&lt;/b&gt; &amp; charts");
    expect(evil).toContain('href="https://revtaw.example/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });

  it("can place the notice before the button", () => {
    const rendered = renderEmail({ ...content, notice: { ...content.notice!, placement: "before-button" } }, options).html;
    expect(rendered.indexOf("Didn&#39;t request this?")).toBeLessThan(rendered.indexOf("Reset Password&nbsp;"));
    expect(html.indexOf("Didn&#39;t request this?")).toBeGreaterThan(html.indexOf("Reset Password&nbsp;"));
  });

  it("writes the same email as plain text", () => {
    expect(text).toBe(`RevTaw · Reviewer Na May Bitaw

Hi there,

Reset your password

We received a request to reset your password.

Account: ana@example.com

Reset Password: https://revtaw.example/auth/confirm?token_hash=abc&type=recovery
This link will expire in 1 hour for your security.

Also today
- 12 cards to review
Start reviewing: https://revtaw.example/flashcards/review

Didn't request this?
You can safely ignore this email.

—
Need help? Contact us at support@revtaw.com
https://revtaw.example
You get this email because you asked for it.
Stop these emails: https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x
This is an automated message, so replies to it aren't read.
`);
  });
});

describe("email icons", () => {
  it("has a file for every icon name", async () => {
    const { existsSync } = await import("node:fs");
    for (const icon of EMAIL_ICONS) expect(existsSync(`public/email/icon-${icon}.png`), icon).toBe(true);
    expect(existsSync("public/email/logo.png")).toBe(true);
  });
});

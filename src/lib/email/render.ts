import { BRAND } from "@/lib/brand";
import { escapeHtml as esc } from "@/lib/email/html";
import { EMAIL_COLORS as C, EMAIL_DARK as D, EMAIL_FONT, EMAIL_WIDTH } from "@/lib/email/theme";

/**
 * RevTaw's email design system: one branded structure that every email reuses, so a reset link, a reminder and
 * the daily digest look like the same product.
 *
 *   header   logo, the RevTaw wordmark, "Reviewer Na May Bitaw" and the developer credit
 *   content  a small icon for the email's type, a greeting, the title (with an optional blue accent), short
 *            paragraphs, optional detail rows, the button, optional lists and an optional notice box
 *   footer   RevTaw, where to get help, the website, why this email came, and an unsubscribe link when it has one
 *
 * The parts (`emailHeader`, `emailIcon`, `emailButton`, `emailDetails`, `emailNotice`, `emailFooter`,
 * `emailLayout`) are plain functions that return HTML, so the same code renders the app's emails and the
 * Supabase sign-in templates (whose addresses are template placeholders). Email-safe on purpose: tables for
 * layout, inline styles, system fonts, no scripts, images with fixed sizes and empty alt text when they only
 * decorate, a hidden preview line, stacking on phones, fallbacks for Outlook, and dark colors for the clients
 * that ask for them. `renderEmail` also writes the plain-text version from the same content.
 */

export const EMAIL_MOTTO = "Reviewer Na May Bitaw";
export const EMAIL_DEVELOPER = BRAND.creator.toUpperCase();

/** The icons in public/email (lucide line icons in a soft-blue circle, 48 px shown at 3x). */
export const EMAIL_ICONS = ["lock", "key", "shield", "mail", "check", "user", "calendar", "calendar-clock", "clock", "book", "bell", "refresh", "alert", "sparkles", "checklist"] as const;
export type EmailIcon = (typeof EMAIL_ICONS)[number];

export type EmailLink = { label: string; href: string };
export type EmailDetail = { label: string; value: string };
export type EmailSection = { title: string; items: string[]; link?: EmailLink | null };
export type EmailNotice = {
  title: string;
  body: string;
  icon?: EmailIcon | null;
  /** "before-button" when the button is the answer to the notice ("Didn't change it? Secure your account"). */
  placement?: "after" | "before-button";
};

export type EmailContent = {
  subject: string;
  /** The line inbox lists show after the subject. */
  preheader: string;
  icon: EmailIcon;
  greeting?: string | null;
  title: string;
  /** The part of the title shown in RevTaw blue, like "password" in "Reset your password". */
  titleAccent?: string | null;
  paragraphs: string[];
  details?: EmailDetail[];
  button?: EmailLink | null;
  /** Under the button, e.g. when its link expires. */
  buttonNote?: string | null;
  /** Also print the button's address, for clients where the button doesn't work (sign-in links). */
  showLink?: boolean;
  sections?: EmailSection[];
  notice?: EmailNotice | null;
  /** Why the student gets this email. */
  reason?: string | null;
  unsubscribe?: EmailLink | null;
};

export type EmailOptions = {
  /** Where the images live: the site's address, or a placeholder like "{{ .SiteURL }}". Null leaves images out. */
  assetBase: string | null;
  /** The website link in the footer. */
  site?: EmailLink | null;
};

export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

const font = (size: number, lineHeight: number, extra = "") => `font-family:${EMAIL_FONT};font-size:${size}px;line-height:${lineHeight}px;mso-line-height-rule:exactly;${extra}`;
const TABLE = 'role="presentation" cellspacing="0" cellpadding="0" border="0"';

export function emailAssetUrl(assetBase: string, file: string): string {
  return `${assetBase.replace(/\/+$/, "")}/email/${file}.png`;
}

/** "Rev" in navy and "Taw" in blue, as live text so it shows even with images off. */
function wordmark(): string {
  return `<span class="rt-ink" style="color:${C.navy};">Rev</span><span class="rt-accent" style="color:${C.blue};">Taw</span>`;
}

function title(text: string, accent: string | null | undefined): string {
  const at = accent ? text.indexOf(accent) : -1;
  if (!accent || at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<span class="rt-accent" style="color:${C.blue};white-space:nowrap;">${esc(accent)}</span>${esc(text.slice(at + accent.length))}`;
}

function divider(): string {
  return `<table ${TABLE} width="100%"><tr><td class="rt-divider" height="1" style="height:1px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;background-color:${C.border};">&nbsp;</td></tr></table>`;
}

/** Rows stacked with fixed gaps (padding, not margins, so every client keeps the rhythm). */
function stack(rows: Array<{ html: string; gap: number }>): string {
  const cells = rows
    .filter((row) => row.html)
    .map((row, index, all) => `<tr><td style="padding:0 0 ${index === all.length - 1 ? 0 : row.gap}px;">${row.html}</td></tr>`)
    .join("");
  return `<table ${TABLE} width="100%">${cells}</table>`;
}

export function emailHeader(assetBase: string | null): string {
  const logo = assetBase
    ? `<td valign="middle" style="padding:0 10px 0 0;"><img src="${esc(emailAssetUrl(assetBase, "logo"))}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:8px;"></td>`
    : "";
  return `<table ${TABLE} width="100%"><tr>
<td class="rt-stack" valign="middle" style="vertical-align:middle;"><table ${TABLE}><tr>${logo}<td valign="middle" style="${font(24, 28, "font-weight:800;letter-spacing:-0.5px;")}">${wordmark()}</td></tr></table></td>
<td class="rt-stack rt-stack-gap" align="right" valign="middle" style="vertical-align:middle;text-align:right;">
<p class="rt-muted" style="margin:0;${font(13, 18, `color:${C.muted};font-weight:600;`)}"><span lang="fil">${EMAIL_MOTTO}</span></p>
<p class="rt-muted" style="margin:2px 0 0;${font(12, 18, `color:${C.muted};`)}">Developed by: <span style="letter-spacing:0.4px;">${esc(EMAIL_DEVELOPER)}</span></p>
</td>
</tr></table>`;
}

/** The type icon: decorative (the title says what the email is), so its alt text is empty. */
export function emailIcon(assetBase: string | null, icon: EmailIcon, size = 48): string {
  if (!assetBase) return "";
  return `<img src="${esc(emailAssetUrl(assetBase, `icon-${icon}`))}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border:0;">`;
}

/** A button that holds up in Outlook: the colored cell carries the padding there, the link everywhere else. */
export function emailButton(link: EmailLink): string {
  return `<table ${TABLE} class="rt-btn-table"><tr><td class="rt-btn-cell" align="center" bgcolor="${C.blue}" style="border-radius:10px;background-color:${C.blue};mso-padding-alt:14px 32px;">
<a class="rt-btn" href="${esc(link.href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;${font(16, 20, `font-weight:700;color:${C.white};text-decoration:none;border-radius:10px;`)}">${esc(link.label)}&nbsp;<span aria-hidden="true">&rarr;</span></a>
</td></tr></table>`;
}

export function emailDetails(details: EmailDetail[]): string {
  if (details.length === 0) return "";
  const rows = details
    .map((detail, index) => {
      const line = index > 0 ? `border-top:1px solid ${C.border};` : "";
      return `<tr><td class="rt-muted rt-rule" valign="top" width="34%" style="width:34%;padding:12px 12px 12px 16px;${line}${font(14, 20, `color:${C.muted};`)}">${esc(detail.label)}</td><td class="rt-ink rt-rule" valign="top" style="padding:12px 16px 12px 0;${line}${font(15, 20, `color:${C.navy};font-weight:600;`)}">${esc(detail.value)}</td></tr>`;
    })
    .join("");
  return `<table ${TABLE} width="100%" class="rt-box" style="border-collapse:separate;border:1px solid ${C.border};border-radius:12px;">${rows}</table>`;
}

export function emailNotice(assetBase: string | null, notice: EmailNotice): string {
  const icon = notice.icon && assetBase ? `<td valign="top" width="56" style="width:56px;padding:16px 0 16px 16px;">${emailIcon(assetBase, notice.icon, 40)}</td>` : "";
  return `<table ${TABLE} width="100%" class="rt-notice" bgcolor="${C.page}" style="border-collapse:separate;background-color:${C.page};border:1px solid ${C.border};border-radius:12px;"><tr>${icon}<td valign="top" style="padding:${icon ? "18px 16px 16px 14px" : "16px"};">
<p class="rt-ink" style="margin:0 0 4px;${font(15, 22, `color:${C.navy};font-weight:700;`)}">${esc(notice.title)}</p>
<p class="rt-notice-text" style="margin:0;${font(14, 21, `color:${C.noticeText};`)}">${esc(notice.body)}</p>
</td></tr></table>`;
}

function section(item: EmailSection): string {
  const items = item.items.map((line) => `<li class="rt-text" style="margin:0 0 4px;${font(15, 22, `color:${C.text};`)}">${esc(line)}</li>`).join("");
  const link = item.link ? `<p style="margin:6px 0 0;${font(14, 20)}"><a class="rt-link" href="${esc(item.link.href)}" target="_blank" rel="noopener" style="color:${C.blue};text-decoration:underline;font-weight:600;">${esc(item.link.label)}</a></p>` : "";
  return `<p class="rt-ink" style="margin:0 0 8px;${font(15, 22, `color:${C.navy};font-weight:700;`)}">${esc(item.title)}</p><ul style="margin:0;padding:0 0 0 20px;">${items}</ul>${link}`;
}

export function emailFooter(options: { site?: EmailLink | null; reason?: string | null; unsubscribe?: EmailLink | null }): string {
  const site = options.site ? `<p class="rt-text" style="margin:2px 0 0;${font(13, 20, `color:${C.text};`)}"><a class="rt-link" href="${esc(options.site.href)}" target="_blank" rel="noopener" style="color:${C.blue};text-decoration:underline;">${esc(options.site.label)}</a></p>` : "";
  const unsubscribe = options.unsubscribe ? ` <a class="rt-link" href="${esc(options.unsubscribe.href)}" target="_blank" rel="noopener" style="color:${C.blue};text-decoration:underline;">${esc(options.unsubscribe.label)}</a>` : "";
  const reason = options.reason || unsubscribe ? `<p class="rt-muted" style="margin:0 0 6px;${font(12, 18, `color:${C.muted};`)}">${options.reason ? esc(options.reason) : ""}${unsubscribe}</p>` : "";
  return `<table ${TABLE} width="100%"><tr>
<td class="rt-stack" valign="top" style="vertical-align:top;">
<p style="margin:0;${font(18, 22, "font-weight:800;letter-spacing:-0.3px;")}">${wordmark()}</p>
<p class="rt-muted" style="margin:2px 0 0;${font(12, 18, `color:${C.muted};`)}"><span lang="fil">${EMAIL_MOTTO}</span></p>
</td>
<td class="rt-stack rt-stack-gap" align="right" valign="top" style="vertical-align:top;text-align:right;">
<p class="rt-text" style="margin:0;${font(13, 20, `color:${C.text};`)}">Need help? Contact us at <a class="rt-link" href="mailto:${esc(BRAND.contactEmail)}" style="color:${C.blue};text-decoration:underline;">${esc(BRAND.contactEmail)}</a></p>
${site}
</td>
</tr><tr><td colspan="2" style="padding:16px 0 0;">
${reason}<p class="rt-muted" style="margin:0;${font(12, 18, `color:${C.muted};`)}">&copy; RevTaw. This is an automated message, so replies to it aren&#39;t read.</p>
</td></tr></table>`;
}

const BASE_CSS = `body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
@media only screen and (max-width:620px){
.rt-outer{padding:16px 8px !important;}
.rt-container{width:100% !important;}
.rt-pad{padding-left:20px !important;padding-right:20px !important;}
.rt-stack{display:block !important;width:100% !important;text-align:left !important;}
.rt-stack-gap{padding-top:10px !important;}
.rt-title{font-size:26px !important;line-height:32px !important;}
.rt-btn-table{width:100% !important;}
.rt-btn{display:block !important;text-align:center !important;}
}`;

// Apple Mail, iOS Mail and Outlook.com use these; the other clients keep the light colors or invert them.
const DARK_CSS = `:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme:dark){
.rt-page{background-color:${D.page} !important;}
.rt-card{background-color:${D.card} !important;border-color:${D.border} !important;}
.rt-ink{color:${D.heading} !important;}
.rt-accent,.rt-link{color:${D.accent} !important;}
.rt-text{color:${D.text} !important;}
.rt-muted{color:${D.muted} !important;}
.rt-rule,.rt-box{border-color:${D.border} !important;}
.rt-divider{background-color:${D.border} !important;}
.rt-notice{background-color:${D.notice} !important;border-color:${D.border} !important;}
.rt-notice-text{color:${D.noticeText} !important;}
}`;

// Outlook.com marks its dark mode with these attributes. A separate block, so a client that rejects the
// selectors drops only this one.
const OUTLOOK_DARK_CSS = `[data-ogsc] .rt-ink{color:${D.heading} !important;}
[data-ogsc] .rt-accent,[data-ogsc] .rt-link{color:${D.accent} !important;}
[data-ogsc] .rt-text{color:${D.text} !important;}
[data-ogsc] .rt-muted{color:${D.muted} !important;}
[data-ogsc] .rt-notice-text{color:${D.noticeText} !important;}
[data-ogsb] .rt-page{background-color:${D.page} !important;}
[data-ogsb] .rt-card{background-color:${D.card} !important;}
[data-ogsb] .rt-notice{background-color:${D.notice} !important;}`;

/** Keeps inbox previews to the preheader instead of the first words of the email. */
const PREVIEW_FILLER = "&#847;&zwnj;&nbsp;".repeat(60);

/** The whole document around a content block. */
export function emailLayout(input: { subject: string; preheader: string; header: string; content: string; footer: string }): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(input.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if mso]><style>body,table,td,p,a,h1,li,span{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>${BASE_CSS}</style>
<style>${DARK_CSS}</style>
<style>${OUTLOOK_DARK_CSS}</style>
</head>
<body class="rt-page" style="margin:0;padding:0;background-color:${C.page};">
<div role="article" aria-roledescription="email" aria-label="${esc(input.subject)}" lang="en" class="rt-page" style="background-color:${C.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(input.preheader)}${PREVIEW_FILLER}</div>
<table ${TABLE} width="100%" class="rt-page" bgcolor="${C.page}" style="background-color:${C.page};"><tr><td class="rt-outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table ${TABLE} width="${EMAIL_WIDTH}" align="center"><tr><td><![endif]-->
<table ${TABLE} width="${EMAIL_WIDTH}" class="rt-container rt-card" bgcolor="${C.white}" style="width:${EMAIL_WIDTH}px;max-width:100%;background-color:${C.white};border:1px solid ${C.border};border-radius:16px;border-collapse:separate;">
<tr><td class="rt-pad" style="padding:28px 40px 24px;">${input.header}</td></tr>
<tr><td class="rt-pad" style="padding:0 40px;">${divider()}</td></tr>
<tr><td class="rt-pad" style="padding:32px 40px;">${input.content}</td></tr>
<tr><td class="rt-pad" style="padding:0 40px;">${divider()}</td></tr>
<tr><td class="rt-pad" style="padding:24px 40px 28px;">${input.footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>
`;
}

function contentHtml(content: EmailContent, assetBase: string | null): string {
  const notice = content.notice ? emailNotice(assetBase, content.notice) : "";
  const noticeFirst = content.notice?.placement === "before-button";
  const button = content.button ? emailButton(content.button) : "";
  const note = content.buttonNote ? `<p class="rt-muted" style="margin:0;${font(14, 20, `color:${C.muted};`)}">${esc(content.buttonNote)}</p>` : "";
  const link =
    content.button && content.showLink
      ? `<p class="rt-muted" style="margin:0;${font(13, 20, `color:${C.muted};`)}">Button not working? Copy this link into your browser:<br><a class="rt-link" href="${esc(content.button.href)}" target="_blank" rel="noopener" style="color:${C.blue};text-decoration:underline;word-break:break-all;">${esc(content.button.href)}</a></p>`
      : "";
  return stack([
    { html: emailIcon(assetBase, content.icon), gap: 20 },
    { html: content.greeting ? `<p class="rt-muted" style="margin:0;${font(16, 24, `color:${C.muted};`)}">${esc(content.greeting)}</p>` : "", gap: 6 },
    { html: `<h1 class="rt-title rt-ink" style="margin:0;${font(34, 40, `color:${C.navy};font-weight:800;letter-spacing:-0.6px;`)}">${title(content.title, content.titleAccent)}</h1>`, gap: 16 },
    ...content.paragraphs.map((paragraph) => ({ html: `<p class="rt-text" style="margin:0;${font(16, 26, `color:${C.text};`)}">${esc(paragraph)}</p>`, gap: 16 })),
    { html: content.details?.length ? emailDetails(content.details) : "", gap: 24 },
    { html: noticeFirst ? notice : "", gap: 24 },
    { html: button, gap: note || link ? 12 : 28 },
    { html: note, gap: link ? 16 : 28 },
    { html: link, gap: 28 },
    ...(content.sections ?? []).map((item) => ({ html: section(item), gap: 24 })),
    { html: noticeFirst ? "" : notice, gap: 0 },
  ]);
}

function textVersion(content: EmailContent, site: EmailLink | null): string {
  const blocks: Array<string | null> = [
    `RevTaw · ${EMAIL_MOTTO}`,
    [content.greeting, content.title].filter(Boolean).join("\n\n"),
    ...content.paragraphs,
    content.details?.length ? content.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n") : null,
    content.notice?.placement === "before-button" ? `${content.notice.title}\n${content.notice.body}` : null,
    content.button ? [`${content.button.label}: ${content.button.href}`, content.buttonNote].filter(Boolean).join("\n") : null,
    ...(content.sections ?? []).map((item) => [item.title, ...item.items.map((line) => `- ${line}`), item.link ? `${item.link.label}: ${item.link.href}` : null].filter(Boolean).join("\n")),
    content.notice && content.notice.placement !== "before-button" ? `${content.notice.title}\n${content.notice.body}` : null,
    [
      "—",
      `Need help? Contact us at ${BRAND.contactEmail}`,
      site ? site.href : null,
      content.reason ?? null,
      content.unsubscribe ? `${content.unsubscribe.label}: ${content.unsubscribe.href}` : null,
      "This is an automated message, so replies to it aren't read.",
    ]
      .filter(Boolean)
      .join("\n"),
  ];
  return `${blocks.filter((block): block is string => Boolean(block && block.trim())).join("\n\n")}\n`;
}

export function renderEmail(content: EmailContent, options: EmailOptions): RenderedEmail {
  const site = options.site ?? null;
  const html = emailLayout({
    subject: content.subject,
    preheader: content.preheader,
    header: emailHeader(options.assetBase),
    content: contentHtml(content, options.assetBase),
    footer: emailFooter({ site, reason: content.reason, unsubscribe: content.unsubscribe }),
  });
  return { subject: content.subject, preheader: content.preheader, html, text: textVersion(content, site) };
}

/** The options for an email the app sends: images and the footer link from the site's public address. */
export function siteEmailOptions(siteUrl: string | null): EmailOptions {
  if (!siteUrl) return { assetBase: null, site: null };
  const base = siteUrl.replace(/\/+$/, "");
  let label = base;
  try {
    label = new URL(base).host;
  } catch {
    // Not a full address: show it as it is.
  }
  return { assetBase: base, site: { href: base, label } };
}

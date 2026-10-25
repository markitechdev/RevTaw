import { escapeHtml as esc } from "@/lib/email/html";
import { EMAIL_SAMPLES } from "@/lib/email/samples";
import { EMAIL_COLORS as C, EMAIL_FONT } from "@/lib/email/theme";

export const dynamic = "force-dynamic";

/**
 * Development only: every RevTaw email with sample data (src/lib/email/samples.ts), to check the design
 * while working on it. Production answers 404.
 */
export function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const groups = [...new Set(EMAIL_SAMPLES.map((sample) => sample.group))];
  const list = groups
    .map((group) => {
      const items = EMAIL_SAMPLES.filter((sample) => sample.group === group)
        .map((sample) => `<li><a href="/dev/emails/${sample.id}">${esc(sample.name)}</a>${sample.render(null).text === null ? "" : ` · <a href="/dev/emails/${sample.id}?format=text">plain text</a>`}</li>`)
        .join("");
      return `<h2>${esc(group)}</h2><ul>${items}</ul>`;
    })
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RevTaw emails</title>
<style>body{margin:0;background:${C.page};color:${C.text};font-family:${EMAIL_FONT};}main{max-width:640px;margin:0 auto;padding:40px 16px;}h1{color:${C.navy};}h2{color:${C.navy};font-size:17px;margin:28px 0 8px;}li{margin:6px 0;}a{color:${C.blue};}p{color:${C.muted};}</style></head>
<body><main><h1>RevTaw emails</h1><p>Every email with sample data, in the shared design. Images load from this server's /email folder. Switch your system to dark mode to see the dark colors (Apple Mail, iOS Mail and Outlook.com use them).</p>${list}</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

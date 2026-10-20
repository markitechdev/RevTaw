import type { ExportBlock, ExportDocument, InlineRun } from "@/lib/export/model";

/**
 * Printer-friendly HTML (spec §34): a standalone page with its own styles,
 * readable on screen and on paper, no app chrome. Everything is escaped;
 * the model carries plain text only.
 */

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function runs(items: InlineRun[]): string {
  return items
    .map((run) => {
      let html = escape(run.text);
      if (run.code) html = `<code>${html}</code>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

function block(item: ExportBlock): string {
  switch (item.type) {
    case "heading":
      return `<h${item.level}>${escape(item.text)}</h${item.level}>`;
    case "paragraph":
      return `<p${item.muted ? ' class="muted"' : ""}>${runs(item.runs)}</p>`;
    case "list":
      return `<${item.ordered ? "ol" : "ul"}>${item.items.map((entry) => `<li>${runs(entry.runs)}${entry.children.length ? `<ul>${entry.children.map((child) => `<li>${runs(child)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${item.ordered ? "ol" : "ul"}>`;
    case "table":
      return `<table><thead><tr>${item.columns.map((column) => `<th>${escape(column)}</th>`).join("")}</tr></thead><tbody>${item.rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    case "keyValues":
      return `<dl>${item.items.map((entry) => `<div><dt>${escape(entry.label)}</dt><dd>${escape(entry.value)}</dd></div>`).join("")}</dl>`;
    case "callout":
      return `<aside class="callout"><span class="label">${escape(item.label)}</span>${runs(item.runs)}</aside>`;
    case "code":
      return `<pre>${escape(item.text)}</pre>`;
    case "pageBreak":
      return `<div class="page-break"></div>`;
  }
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px 48px; font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; max-width: 820px; margin-inline: auto; }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
  h1 { font-size: 26px; margin: 0 0 4px; line-height: 1.2; }
  .subtitle { margin: 0; color: #475569; font-size: 15px; }
  .meta { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; color: #475569; font-size: 12px; }
  h2 { font-size: 18px; margin: 28px 0 8px; padding-top: 4px; break-after: avoid; }
  h3 { font-size: 15px; margin: 18px 0 6px; break-after: avoid; }
  p { margin: 0 0 10px; }
  p.muted { color: #475569; font-size: 13px; }
  ul, ol { margin: 0 0 10px; padding-left: 22px; }
  li { margin: 2px 0; }
  li ul { margin: 2px 0 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 13px; break-inside: auto; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  tr { break-inside: avoid; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 16px; margin: 0 0 14px; }
  dl div { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  dd { margin: 2px 0 0; font-weight: 600; }
  .callout { border-left: 3px solid #4f46e5; background: #f8fafc; padding: 8px 12px; margin: 0 0 12px; border-radius: 0 6px 6px 0; }
  .callout .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #4f46e5; font-weight: 600; margin-bottom: 2px; }
  pre { background: #f1f5f9; border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 12.5px; white-space: pre-wrap; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  section + section { margin-top: 8px; }
  footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #64748b; font-size: 11px; display: flex; justify-content: space-between; gap: 12px; }
  .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 8px 0 12px; background: #fff; }
  .toolbar button, .toolbar a { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; cursor: pointer; text-decoration: none; }
  .toolbar button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .page-break { break-after: page; }
  @media print {
    body { padding: 0; max-width: none; font-size: 12.5px; }
    .toolbar { display: none; }
    a { color: inherit; text-decoration: none; }
    h2 { margin-top: 20px; }
  }
`;

/**
 * The printable page. The only script (the Print button, and the automatic
 * print dialog when `print` is set) carries the request's CSP nonce.
 */
export function renderHtml(document: ExportDocument, options: { print?: boolean; downloads?: { pdf: string; docx: string }; nonce?: string | null } = {}): string {
  const sections = document.sections
    .map((section) => `<section>${section.heading ? `<h2>${escape(section.heading)}</h2>` : ""}${section.blocks.map(block).join("")}</section>`)
    .join("");
  const toolbar = `<div class="toolbar"><button type="button" class="primary" id="print-button">Print</button>${options.downloads ? `<a href="${escape(options.downloads.pdf)}">Download PDF</a><a href="${escape(options.downloads.docx)}">Download Word</a>` : ""}</div>`;
  const script = `document.getElementById("print-button").addEventListener("click", function () { window.print(); });${options.print ? ' window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });' : ""}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(document.title)}</title>
<style>${STYLES}</style>
</head>
<body>
${toolbar}
<header>
<h1>${escape(document.title)}</h1>
${document.subtitle ? `<p class="subtitle">${escape(document.subtitle)}</p>` : ""}
${document.meta.length ? `<ul class="meta">${document.meta.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : ""}
</header>
<main>${sections}</main>
<footer><span>${escape(document.footer)}</span><span>RevTaw</span></footer>
<script${options.nonce ? ` nonce="${escape(options.nonce)}"` : ""}>${script}</script>
</body>
</html>`;
}

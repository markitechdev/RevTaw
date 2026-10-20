import "server-only";

import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

import type { ExportBlock, ExportDocument, InlineRun } from "@/lib/export/model";

/**
 * Word export (spec §34): the document model rendered with real headings,
 * lists and tables so the result is editable, not a picture of a page.
 */

const INK = "0F172A";
const MUTED = "475569";
const ACCENT = "4F46E5";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" } as const;

function runs(items: InlineRun[], extra: { color?: string; size?: number } = {}): TextRun[] {
  return items.map((run) => new TextRun({ text: run.text, bold: run.bold, italics: run.italic, font: run.code ? "Consolas" : undefined, color: extra.color, size: extra.size }));
}

function cell(value: string, header = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: value, bold: header, size: 20 })], spacing: { before: 40, after: 40 } })],
    shading: header ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined,
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

function blocks(items: ExportBlock[]): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const item of items) {
    switch (item.type) {
      case "heading":
        out.push(new Paragraph({ heading: item.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: [new TextRun({ text: item.text, color: INK })], spacing: { before: item.level === 2 ? 320 : 200, after: 120 } }));
        break;
      case "paragraph":
        out.push(new Paragraph({ children: runs(item.runs, item.muted ? { color: MUTED, size: 20 } : {}), spacing: { after: 140 } }));
        break;
      case "list":
        item.items.forEach((entry, index) => {
          out.push(new Paragraph({ children: runs(entry.runs), numbering: item.ordered ? { reference: "numbers", level: 0, instance: index === 0 ? out.length : undefined } : undefined, bullet: item.ordered ? undefined : { level: 0 }, spacing: { after: 60 } }));
          for (const child of entry.children) out.push(new Paragraph({ children: runs(child), bullet: { level: 1 }, spacing: { after: 40 } }));
        });
        break;
      case "table":
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ tableHeader: true, children: item.columns.map((column) => cell(column, true)) }), ...item.rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) }))],
          }),
        );
        out.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "keyValues":
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: item.items.map((entry) => cell(entry.label, true)) }), new TableRow({ children: item.items.map((entry) => cell(entry.value)) })],
          }),
        );
        out.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "callout":
        out.push(
          new Paragraph({
            children: [new TextRun({ text: `${item.label.toUpperCase()}: `, bold: true, color: ACCENT, size: 20 }), ...runs(item.runs)],
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } },
            shading: { type: ShadingType.CLEAR, fill: "F8FAFC", color: "auto" },
            spacing: { before: 80, after: 160 },
            indent: { left: 120 },
          }),
        );
        break;
      case "code":
        for (const line of item.text.split("\n")) out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 19 })], shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" }, spacing: { after: 0 } }));
        out.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "pageBreak":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }
  return out;
}

export async function renderDocx(document: ExportDocument): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: document.title, color: INK })], spacing: { after: 80 } }),
    ...(document.subtitle ? [new Paragraph({ children: [new TextRun({ text: document.subtitle, color: MUTED, size: 24 })], spacing: { after: 80 } })] : []),
    ...(document.meta.length ? [new Paragraph({ children: [new TextRun({ text: document.meta.join("  ·  "), color: MUTED, size: 18 })], spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 6 } } })] : []),
  ];
  for (const section of document.sections) {
    if (section.heading) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: section.heading, color: INK })], spacing: { before: 360, after: 140 } }));
    children.push(...blocks(section.blocks));
  }
  const file = new Document({
    creator: "RevTaw",
    title: document.title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22, color: INK } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 48, bold: true, color: INK }, paragraph: { spacing: { after: 80 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: INK }, paragraph: { spacing: { before: 360, after: 140 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, color: INK }, paragraph: { spacing: { before: 320, after: 120 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 100 } } },
      ],
    },
    numbering: { config: [{ reference: "numbers", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }] },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${document.footer}  ·  RevTaw  ·  page `, color: MUTED, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(file);
}

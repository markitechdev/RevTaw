import { constants, crc32, createDeflate, createDeflateRaw, deflateRawSync, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { chunkSections } from "@/lib/materials/chunk";
import { extractText, formatScripts, htmlToText } from "@/lib/materials/extract";
import { EXTRACTION_LIMITS, extractInSandbox, SandboxError, type SandboxLimits, type SandboxOutput } from "@/lib/materials/extract-sandbox";

// ---------------------------------------------------------------------------
// Tiny file builders (no fixtures on disk).
// ---------------------------------------------------------------------------

/** A PDF whose pages draw the given lines; `contents` replaces page 1's (compressed) stream. */
function buildPdf(pages: string[][], contents?: { flate: Buffer }): Buffer {
  const objects: Array<string | Buffer> = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const streamId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`;
    if (index === 0 && contents) {
      objects[streamId] = Buffer.concat([Buffer.from(`<< /Length ${contents.flate.length} /Filter /FlateDecode >>\nstream\n`), contents.flate, Buffer.from("\nendstream")]);
    } else {
      const ops = lines.map((line, row) => `BT /F1 12 Tf 72 ${720 - row * 18} Td (${line}) Tj ET`).join("\n");
      objects[streamId] = `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`;
    }
  });
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = parts[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length;
    const body = objects[id];
    const chunk = Buffer.concat([Buffer.from(`${id} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  }
  const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`, ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

type ZipEntry = { name: string; data?: Buffer; deflated?: { bytes: Buffer; size: number; crc: number } };

/** A minimal ZIP (deflate), enough for mammoth to read a .docx. */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = entry.deflated?.bytes ?? deflateRawSync(entry.data ?? Buffer.alloc(0));
    const size = entry.deflated?.size ?? (entry.data?.length ?? 0);
    const crc = entry.deflated?.crc ?? crc32(entry.data ?? Buffer.alloc(0));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const CONTENT_TYPES = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
const RELS = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
const DOC_OPEN = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const DOC_CLOSE = "</w:body></w:document>";
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

function buildDocx(documentXml: ZipEntry): Buffer {
  return buildZip([{ name: "[Content_Types].xml", data: CONTENT_TYPES }, { name: "_rels/.rels", data: RELS }, documentXml]);
}

/** Compresses `head + repeat × times + tail` without ever holding the expanded text. */
async function deflateRepeated(head: string, repeat: string, times: number, tail: string, raw: boolean): Promise<{ bytes: Buffer; size: number; crc: number }> {
  const stream = raw ? createDeflateRaw({ level: constants.Z_BEST_COMPRESSION }) : createDeflate({ level: constants.Z_BEST_COMPRESSION });
  const out: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => out.push(chunk));
  const block = Buffer.from(repeat.repeat(Math.ceil(1_000_000 / repeat.length)));
  let crc = crc32(head);
  let size = Buffer.byteLength(head);
  stream.write(head);
  const blocks = Math.ceil((repeat.length * times) / block.length);
  for (let index = 0; index < blocks; index += 1) {
    crc = crc32(block, crc);
    size += block.length;
    if (!stream.write(block)) await new Promise((resolve) => stream.once("drain", resolve));
  }
  crc = crc32(tail, crc);
  size += Buffer.byteLength(tail);
  await new Promise<void>((resolve) => stream.end(tail, () => resolve()));
  return { bytes: Buffer.concat(out), size, crc };
}

// Tight limits so a bomb trips them quickly in tests.
const TEST_LIMITS: SandboxLimits = { ...EXTRACTION_LIMITS, timeoutMs: 20_000, memoryMb: 320 };
const posixOnly = process.platform === "win32" ? it.skip : it;

describe("extractInSandbox", () => {
  it("reads the text of each PDF page", async () => {
    const pdf = buildPdf([["Photosynthesis makes glucose"], ["Mitochondria release energy"]]);
    const result = await extractInSandbox("pdf", pdf);
    expect(result.kind).toBe("pdf");
    if (result.kind !== "pdf") return;
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.pages.map((page) => page.text.trim())).toEqual(["Photosynthesis makes glucose", "Mitochondria release energy"]);
  }, 30_000);

  it("stops at the page limit and says so", async () => {
    const pdf = buildPdf([["One"], ["Two"], ["Three"]]);
    const result = await extractInSandbox("pdf", pdf, { ...EXTRACTION_LIMITS, maxPages: 2 });
    expect(result.kind === "pdf" && result.pages.length).toBe(2);
    expect(result.truncated).toBe(true);
  }, 30_000);

  it("reads a Word document as HTML", async () => {
    const docx = buildDocx({ name: "word/document.xml", data: Buffer.from(`${DOC_OPEN}${paragraph("Cell membranes are selectively permeable")}${DOC_CLOSE}`) });
    const result = await extractInSandbox("docx", docx);
    expect(result.kind === "docx" && result.html).toContain("Cell membranes are selectively permeable");
  }, 30_000);

  it("turns Word equations into text instead of dropping them, and counts skipped pictures", async () => {
    const MATH_OPEN = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>';
    const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
    const inline = `<w:p><w:r><w:t xml:space="preserve">The final velocity is </w:t></w:r><m:oMath>${run("v")}${run("=")}${run("u")}${run("+")}${run("a")}${run("t")}</m:oMath><w:r><w:t xml:space="preserve"> and the displacement is</w:t></w:r></w:p>`;
    const display = `<w:p><m:oMathPara><m:oMath>${run("s")}${run("=")}${run("ut")}${run("+")}<m:f><m:num>${run("1")}</m:num><m:den>${run("2")}</m:den></m:f>${run("a")}<m:sSup><m:e>${run("t")}</m:e><m:sup>${run("2")}</m:sup></m:sSup></m:oMath></m:oMathPara></w:p>`;
    const root = `<w:p><m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run("b")}<m:sSup><m:e/><m:sup>${run("2")}</m:sup></m:sSup>${run("−4ac")}</m:e></m:rad></m:oMath></w:p>`;
    const raised = '<w:p><w:r><w:t xml:space="preserve">Avogadro constant: 6.02 × 10</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>23</w:t></w:r><w:r><w:t xml:space="preserve"> per mole. Water is H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>O.</w:t></w:r></w:p>';
    const docx = buildDocx({ name: "word/document.xml", data: Buffer.from(`${MATH_OPEN}${inline}${display}${root}${raised}${DOC_CLOSE}`) });
    const result = await extractInSandbox("docx", docx);
    expect(result.kind).toBe("docx");
    if (result.kind !== "docx") return;
    expect(result.equations).toBe(3);
    expect(result.images).toBe(0);
    const text = htmlToText(result.html);
    expect(text).toContain("The final velocity is v=u+at and the displacement is");
    expect(text).toContain("s=ut+1/2at²");
    expect(text).toContain("√(b²−4ac)");
    expect(text).toContain("Avogadro constant: 6.02 × 10²³ per mole. Water is H₂O.");
  }, 30_000);

  it("marks raised and lowered PDF text instead of running it into the line", async () => {
    // "6.02 x 10" with a smaller "23" set up against it, and "H" with a smaller "2" set down, then "O".
    const ops = [
      "BT /F1 12 Tf 72 720 Td (Avogadro: 6.02 x 10) Tj ET",
      "BT /F1 7 Tf 174.7 725 Td (23) Tj ET",
      "BT /F1 12 Tf 72 690 Td (Water is H) Tj ET",
      "BT /F1 7 Tf 131.4 686 Td (2) Tj ET",
      "BT /F1 12 Tf 135.4 690 Td (O) Tj ET",
    ].join("\n");
    const flate = { bytes: deflateSync(Buffer.from(ops)) };
    const pdf = buildPdf([["unused"]], { flate: flate.bytes });
    const result = await extractInSandbox("pdf", pdf);
    expect(result.kind).toBe("pdf");
    if (result.kind !== "pdf") return;
    const text = formatScripts(result.pages[0].text);
    expect(text).toContain("6.02 x 10²³");
    expect(text).toContain("H₂O");
    expect(text).not.toContain("1023");
  }, 30_000);

  it("says which PDF pages had no text to read, and refuses a scan with nothing but page numbers", async () => {
    const mixed = buildPdf([["Chapter 1 Cells", "The cell is the basic unit of life."], ["2"], [], ["Chapter 4 Tissues", "A tissue is a group of similar cells."]]);
    const result = await extractText("pdf", mixed, "application/pdf");
    expect(result.sections.map((section) => section.page)).toEqual([1, 4]);
    expect(result.notes).toEqual(["Pages 2–3 have no readable text (scanned or image-only), so nothing was made from them. To include them, upload those pages as photos or screenshots."]);
    // A chunk never claims the pages in between.
    expect(chunkSections(result.sections).map((chunk) => [chunk.pageStart, chunk.pageEnd])).toEqual([[1, 1], [4, 4]]);

    const scanned = buildPdf([["Page 1"], ["Page 2"], ["- 3 -"]]);
    await expect(extractText("pdf", scanned, "application/pdf")).rejects.toMatchObject({ name: "ExtractionError", message: expect.stringMatching(/scanned document/) });
  }, 30_000);

  it("reports a file the parser rejects", async () => {
    await expect(extractInSandbox("pdf", Buffer.from("%PDF-1.4\nthis is not a pdf"))).rejects.toMatchObject({ name: "SandboxError", reason: "parse" });
  }, 30_000);

  it("enforces the deadline", async () => {
    const pdf = buildPdf([["Slow"]]);
    await expect(extractInSandbox("pdf", pdf, { ...EXTRACTION_LIMITS, timeoutMs: 1 })).rejects.toMatchObject({ reason: "timeout" });
  }, 30_000);

  posixOnly("contains a DOCX decompression bomb (≈150 KB → 180 MB of XML)", async () => {
    const xml = await deflateRepeated(DOC_OPEN, paragraph("a"), 5_000_000, DOC_CLOSE, true);
    expect(xml.bytes.length).toBeLessThan(1_000_000);
    const docx = buildDocx({ name: "word/document.xml", deflated: xml });
    const started = Date.now();
    const error = await extractInSandbox("docx", docx, TEST_LIMITS).then(() => null, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(SandboxError);
    expect(["memory", "timeout", "crashed", "parse"]).toContain((error as SandboxError).reason);
    expect(Date.now() - started).toBeLessThan(TEST_LIMITS.timeoutMs + 5_000);
    // This process is unaffected.
    expect(process.memoryUsage().rss).toBeLessThan(1_500 * 1024 * 1024);
  }, 60_000);

  posixOnly("contains a PDF content-stream bomb (≈400 KB → 400 MB)", async () => {
    const flate = await deflateRepeated("BT /F1 12 Tf 72 720 Td ", "(a) Tj ", 57_000_000, "ET", false);
    expect(flate.bytes.length).toBeLessThan(2_000_000);
    const pdf = buildPdf([["unused"]], { flate: flate.bytes });
    const started = Date.now();
    const outcome: SandboxOutput | SandboxError = await extractInSandbox("pdf", pdf, TEST_LIMITS).then(
      (result) => result,
      (failure: unknown) => {
        if (failure instanceof SandboxError) return failure;
        throw failure;
      },
    );
    // pdf.js may stream through it within the limits; then the text is capped. Otherwise the child is stopped.
    if (outcome instanceof SandboxError) {
      expect(["memory", "timeout", "crashed", "parse"]).toContain(outcome.reason);
    } else {
      expect(outcome.kind).toBe("pdf");
      const chars = outcome.kind === "pdf" ? outcome.pages.reduce((sum, page) => sum + page.text.length, 0) : Infinity;
      expect(chars).toBeLessThanOrEqual(TEST_LIMITS.maxChars);
    }
    expect(Date.now() - started).toBeLessThan(TEST_LIMITS.timeoutMs + 5_000);
    expect(process.memoryUsage().rss).toBeLessThan(1_500 * 1024 * 1024);
  }, 60_000);
});

import { describe, expect, it } from "vitest";

import { charsetOf, decodeText, detectMaterialType, textEncoding } from "@/lib/materials/detect";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("detectMaterialType", () => {
  it("reads notes that begin like a binary format as text", async () => {
    for (const note of ["BMI (body mass index) is weight divided by height squared.", "BMR is the energy used at rest.", "BM25 ranks documents by term frequency.", "ID3 is a decision tree algorithm.", "MZ is not a word, but this is a note."]) {
      expect(await detectMaterialType(utf8(note))).toEqual({ source: "text", mime: "text/plain" });
    }
  });

  it("still rejects binary files and RTF, and still knows a PDF", async () => {
    const bitmap = new Uint8Array(200);
    bitmap.set([0x42, 0x4d, 0xc8, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, 0, 0, 0]);
    expect(await detectMaterialType(bitmap)).toBeNull();
    expect(await detectMaterialType(utf8("{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times;}} Hello\\par}"))).toBeNull();
    expect((await detectMaterialType(utf8("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< >>\nendobj\n")))?.source).toBe("pdf");
    expect(await detectMaterialType(new Uint8Array(0))).toBeNull();
  });

  it("reads a long UTF-8 note whatever character falls at the sample's edge", async () => {
    for (const shift of [0, 1, 2]) {
      const text = `${"a".repeat(63_998 + shift)}•“Niño” 日本語 ${"b".repeat(100)}`;
      expect(await detectMaterialType(utf8(text))).toEqual({ source: "text", mime: "text/plain" });
    }
  });

  it("detects Windows ANSI and UTF-16 text files and keeps their charset", async () => {
    const ansi = Uint8Array.from([...Buffer.from("Ang Para", "latin1"), 0xf1, ...Buffer.from("aque ay lungsod. ", "latin1"), 0x93, ...Buffer.from("Ni", "latin1"), 0xf1, ...Buffer.from("o", "latin1"), 0x94]);
    expect(await detectMaterialType(ansi)).toEqual({ source: "text", mime: "text/plain; charset=windows-1252" });
    expect(decodeText(ansi, charsetOf("text/plain; charset=windows-1252"))).toBe("Ang Parañaque ay lungsod. “Niño”");

    const note = "Ang Parañaque ay isang lungsod. “Niño”";
    const withBom = Uint8Array.from([0xff, 0xfe, ...Buffer.from(note, "utf16le")]);
    expect(await detectMaterialType(withBom)).toEqual({ source: "text", mime: "text/plain; charset=utf-16le" });
    expect(decodeText(withBom, "utf-16le")).toBe(note);
    expect(textEncoding(Uint8Array.from(Buffer.from(note, "utf16le")))).toBe("utf-16le");
  });

  it("keeps a UTF-8 file with a stray byte as UTF-8 rather than garbling every accent", () => {
    const text = utf8("Parañaque, Niño, café, résumé, naïve, jalapeño. ".repeat(5));
    const stray = Uint8Array.from([...text, 0x96, ...utf8(" end")]);
    expect(textEncoding(stray)).toBe("utf-8");
    expect(decodeText(stray, "utf-8")).toContain("Parañaque");
  });

  it("reads the charset of a stored MIME type", () => {
    expect(charsetOf("text/plain")).toBe("utf-8");
    expect(charsetOf(null)).toBe("utf-8");
    expect(charsetOf("text/plain; charset=UTF-16LE")).toBe("utf-16le");
    expect(charsetOf("text/plain; charset=evil")).toBe("utf-8");
  });
});

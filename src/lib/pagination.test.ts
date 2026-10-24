import { describe, expect, it } from "vitest";

import { pageCountOf, pageOf, pageOfIndex, pageRange, parsePage, withPage } from "@/lib/pagination";

describe("pagination", () => {
  it("reads the page number from the URL, falling back to 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(["3", "9"])).toBe(3);
    expect(parsePage("1234567")).toBe(1); // absurdly long: not a page
  });

  it("turns a page into PostgREST's inclusive range", () => {
    expect(pageRange(1, 24)).toEqual([0, 23]);
    expect(pageRange(2, 24)).toEqual([24, 47]);
    expect(pageRange(3, 20)).toEqual([40, 59]);
  });

  it("counts pages, with at least one", () => {
    expect(pageCountOf(0, 24)).toBe(1);
    expect(pageCountOf(24, 24)).toBe(1);
    expect(pageCountOf(25, 24)).toBe(2);
    expect(pageOf(["a"], 49, 3, 24).pageCount).toBe(3);
  });

  it("knows which page a row is on", () => {
    expect(pageOfIndex(0, 12)).toBe(1);
    expect(pageOfIndex(11, 12)).toBe(1);
    expect(pageOfIndex(12, 12)).toBe(2);
    expect(pageOfIndex(-1, 12)).toBe(1);
  });

  it("builds page links that keep the other filters and leave page 1 plain", () => {
    expect(withPage("/materials", { subject: "s1", folder: null }, 1)).toBe("/materials?subject=s1");
    expect(withPage("/materials", { subject: "s1", archived: "1" }, 3)).toBe("/materials?subject=s1&archived=1&page=3");
    expect(withPage("/quiz", {}, 1)).toBe("/quiz");
    expect(withPage("/quiz", new URLSearchParams("page=9&view=learned"), 2)).toBe("/quiz?view=learned&page=2");
  });
});

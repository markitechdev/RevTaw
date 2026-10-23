import { describe, expect, it } from "vitest";

import { abilityOf, chunked, optionCount, readPages } from "@/lib/adaptive/evidence";

describe("evidence helpers", () => {
  it("reads past the 1,000-row page limit, newest first, up to a cap", async () => {
    const table = Array.from({ length: 2500 }, (_, index) => index);
    const ranges: Array<[number, number]> = [];
    const build = async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    };
    expect(await readPages(build, 10_000)).toHaveLength(2500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    ranges.length = 0;
    expect(await readPages(build, 1500)).toHaveLength(1500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
    await expect(readPages(async () => ({ data: null, error: { message: "denied" } }), 10)).rejects.toThrow("denied");
  });

  it("splits id lists, counts options and shrinks ability towards zero", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(optionCount([{ id: "a" }, { id: "b" }, { id: "c" }])).toBe(3);
    expect(optionCount(null)).toBeNull();
    expect(abilityOf([])).toBe(0);
    // 10 answers at +1 and nothing else: halfway to +1, as if 10 more answers sat at 0.
    expect(abilityOf([{ elo_rating: 1, elo_answers: 10 }, { elo_rating: 3, elo_answers: 0 }])).toBeCloseTo(0.5, 6);
  });
});

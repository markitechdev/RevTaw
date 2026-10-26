import { describe, expect, it } from "vitest";

import { cumulativeCounts, weave } from "@/lib/study/mixing";

describe("cumulative review mix", () => {
  it("gives the current lesson its 60% and the earlier ones the rest, adding up exactly", () => {
    // Ten minutes is five prompts: three current, not two.
    expect(cumulativeCounts(5, 3)).toEqual([3, 1, 1, 0]);
    expect(cumulativeCounts(10, 3)).toEqual([6, 2, 1, 1]);
    expect(cumulativeCounts(15, 1)).toEqual([9, 6]);
    expect(cumulativeCounts(3, 2)).toEqual([2, 1, 0]);
    for (const total of [3, 5, 8, 15]) for (const older of [1, 2, 3]) expect(cumulativeCounts(total, older).reduce((sum, count) => sum + count, 0)).toBe(total);
    // No earlier lesson: everything is the current one.
    expect(cumulativeCounts(5, 0)).toEqual([5]);
  });

  it("weaves the earlier lessons through the session instead of tacking them on", () => {
    expect(weave([["c1", "c2", "c3"], ["e1"], ["f1"]])).toEqual(["c1", "c2", "e1", "f1", "c3"]);
    expect(weave([["c1", "c2", "c3", "c4"], ["e1", "e2"]])).toEqual(["c1", "e1", "c2", "c3", "e2", "c4"]);
    expect(weave([["c1"], []])).toEqual(["c1"]);
  });
});

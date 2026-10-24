import { describe, expect, it } from "vitest";

import { seededRandom, shuffled } from "@/lib/random";

describe("shuffled", () => {
  it("returns a reordered copy with the same items and leaves the list alone", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const copy = shuffled(items);
    expect(items).toEqual(Array.from({ length: 50 }, (_, index) => index));
    expect([...copy].sort((a, b) => a - b)).toEqual(items);
    expect(copy).not.toEqual(items);
  });

  it("gives the same order for the same seed (an attempt's option order) and another for another seed", () => {
    const options = ["a", "b", "c", "d", "e", "f"];
    expect(shuffled(options, seededRandom("attempt-1:question-1"))).toEqual(shuffled(options, seededRandom("attempt-1:question-1")));
    expect(shuffled(options, seededRandom("attempt-1:question-1"))).not.toEqual(shuffled(options, seededRandom("attempt-2:question-1")));
  });
});

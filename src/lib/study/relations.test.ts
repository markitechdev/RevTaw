import { describe, expect, it } from "vitest";

import { gradeVisual } from "@/lib/study/visuals";
import { sameRelation } from "@/lib/study/relations";

describe("relationship wordings", () => {
  it("takes a same-direction synonym for the material's wording", () => {
    expect(sameRelation("causes", "leads to")).toBe(true);
    expect(sameRelation("Depends on", "requires")).toBe(true);
    expect(sameRelation("is a type of", "is an example of")).toBe(true);
    expect(sameRelation("leads to", "leads to")).toBe(true);
    expect(sameRelation("absorbs", "absorbs")).toBe(true);
  });

  it("keeps opposite directions and different relations apart", () => {
    expect(sameRelation("contains", "is part of")).toBe(false);
    expect(sameRelation("requires", "is required for")).toBe(false);
    expect(sameRelation("increases", "decreases")).toBe(false);
    expect(sameRelation("causes", "requires")).toBe(false);
    expect(sameRelation("", "")).toBe(false);
  });

  it("grades a rebuilt relationship visual by meaning", () => {
    const visual = { type: "relationships" as const, nodes: ["Light", "Photosynthesis", "Glucose"], links: [{ from: "Light", to: "Photosynthesis", relation: "is required for" }, { from: "Photosynthesis", to: "Glucose", relation: "produces" }] };
    expect(gradeVisual(visual, { kind: "relations", relations: ["is required for", "makes"] }).marks).toEqual([true, true]);
    expect(gradeVisual(visual, { kind: "relations", relations: ["requires", "contains"] }).marks).toEqual([false, false]);
  });
});

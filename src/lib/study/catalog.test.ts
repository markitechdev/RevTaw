import { describe, expect, it } from "vitest";

import { BUILDER_METHOD_IDS, defaultBuilderMethod, METHOD_BEHAVIOR, methodLock } from "@/lib/study/catalog";

const nothing = { materials: 0, openMistakes: 0, dueCards: 0 };

describe("which study methods can start", () => {
  it("locks the methods that build questions from a material until one is processed", () => {
    const locked = BUILDER_METHOD_IDS.filter((id) => methodLock(id, nothing) === "material");
    expect(locked).toContain("active_recall");
    expect(locked.every((id) => METHOD_BEHAVIOR[id].requiresMaterial)).toBe(true);
    expect(methodLock("smart_study", nothing)).toBeNull();
    expect(methodLock("pomodoro", nothing)).toBeNull();
    expect(methodLock("active_recall", { ...nothing, materials: 1 })).toBeNull();
  });

  it("gives the other methods their own reasons", () => {
    expect(methodLock("error_review", nothing)).toBe("mistakes");
    expect(methodLock("error_review", { ...nothing, openMistakes: 2 })).toBeNull();
    expect(methodLock("spaced_repetition", nothing)).toBe("due");
    expect(methodLock("spaced_repetition", { ...nothing, dueCards: 5 })).toBeNull();
    expect(methodLock("interleaving", { ...nothing, materials: 1 })).toBe("two-materials");
    expect(methodLock("interleaving", { ...nothing, materials: 2 })).toBeNull();
  });

  it("picks Active Recall first, or a method that can start when it is locked", () => {
    expect(defaultBuilderMethod({ ...nothing, materials: 1 })).toBe("active_recall");
    const pick = defaultBuilderMethod(nothing);
    expect(pick).not.toBe("active_recall");
    expect(methodLock(pick, nothing)).toBeNull();
  });
});

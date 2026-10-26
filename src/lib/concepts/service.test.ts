import { describe, expect, it } from "vitest";

import { conceptCore, ensureConcepts, knownConceptsLine, normalizeConceptName } from "@/lib/concepts/service";
import { fakeSupabase } from "@/test/fake-supabase";

describe("normalizeConceptName", () => {
  it("keeps C, C++ and C# apart", () => {
    const keys = ["C", "C++", "C#", "c sharp", "F#"].map(normalizeConceptName);
    expect(keys).toEqual(["c", "c plus plu", "c sharp", "c sharp", "f sharp"]);
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
  });

  it("still joins case, accents, punctuation and plurals", () => {
    expect(normalizeConceptName("Linked Lists")).toBe(normalizeConceptName("linked list"));
    expect(normalizeConceptName("Café-au-lait")).toBe("cafe au lait");
    expect(normalizeConceptName("  Mitosis:  phases ")).toBe("mitosis phase");
  });
});

describe("conceptCore", () => {
  const core = (name: string) => conceptCore(normalizeConceptName(name));

  it("takes the wrapper words off a concept name", () => {
    expect(core("Photosynthesis process")).toBe(normalizeConceptName("Photosynthesis"));
    expect(core("The process of photosynthesis")).toBe(normalizeConceptName("Photosynthesis"));
    expect(core("Role of the stroma")).toBe(normalizeConceptName("Stroma"));
    expect(core("Definition of osmosis")).toBe(normalizeConceptName("Osmosis"));
    expect(core("Definition of a limit")).toBe(normalizeConceptName("Limit"));
    expect(core("Cells overview")).toBe(normalizeConceptName("Cells"));
    expect(core("Introduction to genetics")).toBe(normalizeConceptName("Genetics"));
    expect(core("Overview of the process of photosynthesis")).toBe(normalizeConceptName("Photosynthesis"));
  });

  it("leaves names that are concepts of their own", () => {
    for (const name of ["Types of tissue", "Calvin cycle", "Process", "The process", "Self-concept", "Word meaning", "Function of the liver", "Visual Basic"]) {
      expect(core(name)).toBe(normalizeConceptName(name));
    }
  });

  it("is its own core", () => {
    for (const name of ["Photosynthesis process", "Role of the stroma", "Overview of the process of photosynthesis", "Calvin cycle"]) {
      expect(conceptCore(core(name))).toBe(core(name));
    }
  });
});

describe("knownConceptsLine", () => {
  it("lists the names for a prompt, or nothing", () => {
    expect(knownConceptsLine([])).toBe("");
    expect(knownConceptsLine(["Photosynthesis", 'The "light" reactions'])).toBe(
      `Concept names this material already uses (for an item on one of these concepts, use its name exactly): "Photosynthesis", "The 'light' reactions"\n`,
    );
  });
});

describe("ensureConcepts", () => {
  const origin = { materialId: "m1", subjectId: null };
  const concept = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, user_id: "u1", name, normalized_name: normalizeConceptName(name), material_id: "m1", created_at: id, ...extra });

  it("joins a wrapped name to the plain concept the student has", async () => {
    const { client, tables } = fakeSupabase({ concepts: [concept("c1", "Photosynthesis")] });
    const ids = await ensureConcepts(client, "u1", ["Photosynthesis process", "The process of photosynthesis"], origin);
    expect(ids.get(normalizeConceptName("Photosynthesis process"))).toBe("c1");
    expect(ids.get(normalizeConceptName("The process of photosynthesis"))).toBe("c1");
    expect(tables.concepts).toHaveLength(1);
  });

  it("joins a plain name to a wrapped concept made from the same material", async () => {
    const { client, tables } = fakeSupabase({ concepts: [concept("c1", "Photosynthesis process")] });
    const ids = await ensureConcepts(client, "u1", ["Photosynthesis"], origin);
    expect(ids.get(normalizeConceptName("Photosynthesis"))).toBe("c1");
    expect(tables.concepts).toHaveLength(1);
  });

  it("makes one concept for names given together that share a core, under the plain name", async () => {
    const { client, tables } = fakeSupabase({ concepts: [] });
    const ids = await ensureConcepts(client, "u1", ["Photosynthesis process", "Photosynthesis", "Role of the stroma", "Definition of the stroma"], origin);
    expect(tables.concepts.map((row) => row.name)).toEqual(["Photosynthesis", "Role of the stroma"]);
    expect(ids.get(normalizeConceptName("Photosynthesis process"))).toBe(ids.get(normalizeConceptName("Photosynthesis")));
    expect(ids.get(normalizeConceptName("Definition of the stroma"))).toBe(ids.get(normalizeConceptName("Role of the stroma")));
    expect(new Set(ids.values()).size).toBe(2);
  });

  it("never joins another student's concept, and keeps different concepts apart", async () => {
    const { client, tables } = fakeSupabase({ concepts: [concept("c1", "Photosynthesis", { user_id: "u2" }), concept("c2", "Light-dependent reactions")] });
    const ids = await ensureConcepts(client, "u1", ["Photosynthesis", "Light-independent reactions", "Types of tissue"], origin);
    expect(ids.get(normalizeConceptName("Photosynthesis"))).not.toBe("c1");
    expect(ids.get(normalizeConceptName("Light-independent reactions"))).not.toBe("c2");
    expect(tables.concepts.filter((row) => row.user_id === "u1").map((row) => row.name)).toEqual(["Light-dependent reactions", "Photosynthesis", "Light-independent reactions", "Types of tissue"]);
  });
});

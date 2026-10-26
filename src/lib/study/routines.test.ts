import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/adaptive/smart", async () => {
  const { z } = await import("zod");
  return { smartPlanSchema: z.object({}) };
});
vi.mock("@/lib/study/duplicates", () => ({ startUnlessDuplicate: vi.fn() }));

const { routineFormSchema } = await import("@/lib/study/routines");

const block = (minutes: number) => ({ method: "active_recall", minutes });

describe("routineFormSchema", () => {
  it("saves a routine that a plan can run", () => {
    expect(routineFormSchema.safeParse({ title: "Exam day", blocks: Array.from({ length: 8 }, () => block(60)) }).success).toBe(true);
  });

  it("refuses more blocks than a plan holds", () => {
    const parsed = routineFormSchema.safeParse({ title: "Too many", blocks: Array.from({ length: 9 }, () => block(10)) });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/at most 8 blocks/);
  });

  it("refuses a routine longer than a session can be", () => {
    const parsed = routineFormSchema.safeParse({ title: "Marathon", blocks: [block(240), block(240), block(30)] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/at most 8 hours \(480 minutes\)/);
  });
});

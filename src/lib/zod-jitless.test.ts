import { describe, expect, it } from "vitest";
import { z } from "zod";

import { makeZodJitless } from "@/lib/zod-jitless";

describe("makeZodJitless", () => {
  it("reaches zod's own settings, so its eval probe is skipped", () => {
    expect(z.config().jitless).not.toBe(true);
    makeZodJitless();
    // If a zod upgrade renames its global, this fails instead of the CSP report quietly coming back.
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).parse({ a: "x" })).toEqual({ a: "x" });
  });
});

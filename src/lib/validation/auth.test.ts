import { describe, expect, it } from "vitest";

import { AGREEMENT_REQUIRED, fieldErrorsFrom, registerSchema } from "@/lib/validation/auth";

const valid = { displayName: "Mia Santos", email: "Mia@Example.com", password: "RevTaw-Study-2026", agree: "yes" };

describe("the sign-up form", () => {
  it("accepts a sign-up that agrees to the Terms and the Privacy Notice", () => {
    const parsed = registerSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.email).toBe("mia@example.com");
  });

  it("refuses one without the agreement, and says what to do", () => {
    for (const agree of ["", "on", undefined]) {
      const parsed = registerSchema.safeParse({ ...valid, agree });
      expect(parsed.success).toBe(false);
      expect(fieldErrorsFrom(parsed.error!)).toEqual({ agree: AGREEMENT_REQUIRED });
    }
  });
});

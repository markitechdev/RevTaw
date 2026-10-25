import { describe, expect, it } from "vitest";

import { AiError } from "@/lib/ai/errors";
import { tutorErrorMessage } from "@/lib/tutor/service";

describe("tutorErrorMessage", () => {
  it("says the question is saved and offers Try again, with no technical detail", () => {
    for (const code of ["provider_error", "rate_limited", "invalid_output", "unsupported"] as const) {
      const message = tutorErrorMessage(new AiError(code, 'HTTP 500 from upstream: {"error":"model overloaded"}'));
      expect(message).toMatch(/question is saved — press Try again/);
      expect(message).not.toMatch(/HTTP|500|JSON|schema|upstream|provider|model|error/i);
    }
  });

  it("keeps the daily limit's message, which says when it refills", () => {
    const error = new AiError("quota_exceeded", "daily chat limit of 40 reached", false, { message: "You've used today's 40 Tamari messages. They refill at midnight, Philippine time." });
    expect(tutorErrorMessage(error)).toBe("You've used today's 40 Tamari messages. They refill at midnight, Philippine time.");
  });

  it("says when Tamari isn't set up or the request is too big", () => {
    expect(tutorErrorMessage(new AiError("not_configured"))).toBe("Tamari isn't set up on this server yet.");
    expect(tutorErrorMessage(new AiError("content_too_large"))).toMatch(/smaller part/);
  });
});

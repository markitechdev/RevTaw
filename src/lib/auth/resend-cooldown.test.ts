import { describe, expect, it } from "vitest";

import { pendingVerificationValue, readPendingVerification, resendSecondsLeft, VERIFICATION_RESEND_SECONDS } from "@/lib/auth/resend-cooldown";

const now = 1_800_000_000_000;

describe("readPendingVerification", () => {
  it("reads the address and when it may be emailed again", () => {
    const value = pendingVerificationValue({ email: "ana@example.com", resendAt: now + 30_000 });
    expect(readPendingVerification(value)).toEqual({ email: "ana@example.com", resendAt: now + 30_000 });
    expect(readPendingVerification(pendingVerificationValue({ email: "ana@example.com", resendAt: null }))).toEqual({ email: "ana@example.com", resendAt: null });
  });

  it("still reads the cookie from before the cooldown, which held only the address", () => {
    expect(readPendingVerification("ana@example.com")).toEqual({ email: "ana@example.com", resendAt: null });
  });

  it("treats anything unreadable as no cookie", () => {
    expect(readPendingVerification(undefined)).toBeNull();
    expect(readPendingVerification("")).toBeNull();
    expect(readPendingVerification("not-an-address")).toBeNull();
    expect(readPendingVerification(`${"a".repeat(250)}@example.com`)).toBeNull();
    expect(readPendingVerification("{broken")).toBeNull();
    expect(readPendingVerification("{}")).toBeNull();
    expect(readPendingVerification(JSON.stringify({ email: 42, resendAt: now }))).toBeNull();
    expect(readPendingVerification(JSON.stringify({ email: "no-at-sign", resendAt: now }))).toBeNull();
  });

  it("drops a wait it can't read but keeps the address", () => {
    expect(readPendingVerification(JSON.stringify({ email: "ana@example.com", resendAt: "soon" }))).toEqual({ email: "ana@example.com", resendAt: null });
    expect(readPendingVerification('{"email":"ana@example.com","resendAt":1e999}')).toEqual({ email: "ana@example.com", resendAt: null });
  });
});

describe("resendSecondsLeft", () => {
  it("is 0 when nothing was sent or the minute is over", () => {
    expect(resendSecondsLeft(null, now)).toBe(0);
    expect(resendSecondsLeft(now, now)).toBe(0);
    expect(resendSecondsLeft(now - 5_000, now)).toBe(0);
  });

  it("rounds up, so the button never opens early", () => {
    expect(resendSecondsLeft(now + 30_500, now)).toBe(31);
    expect(resendSecondsLeft(now + 1, now)).toBe(1);
    expect(resendSecondsLeft(now + VERIFICATION_RESEND_SECONDS * 1000, now)).toBe(VERIFICATION_RESEND_SECONDS);
  });

  it("never asks for more than the cooldown, whatever the cookie says", () => {
    expect(resendSecondsLeft(now + 10 * 60_000, now)).toBe(VERIFICATION_RESEND_SECONDS);
  });
});

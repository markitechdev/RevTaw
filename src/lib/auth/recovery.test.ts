import { describe, expect, it } from "vitest";

import { RECOVERY_WINDOW_SECONDS, signedInByEmailLinkRecently } from "@/lib/auth/recovery";

const now = 1_800_000_000;

describe("signedInByEmailLinkRecently", () => {
  it.each(["recovery", "otp", "magiclink"])("accepts a %s sign-in from the last 15 minutes", (method) => {
    expect(signedInByEmailLinkRecently({ amr: [{ method, timestamp: now - 60 }] }, now)).toBe(true);
    expect(signedInByEmailLinkRecently({ amr: [{ method, timestamp: now - RECOVERY_WINDOW_SECONDS }] }, now)).toBe(true);
  });

  it("refuses an email-link sign-in older than the window", () => {
    expect(signedInByEmailLinkRecently({ amr: [{ method: "recovery", timestamp: now - RECOVERY_WINDOW_SECONDS - 1 }] }, now)).toBe(false);
  });

  it("refuses password and refreshed sessions", () => {
    expect(signedInByEmailLinkRecently({ amr: [{ method: "password", timestamp: now - 5 }] }, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: [{ method: "token_refresh", timestamp: now - 5 }] }, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: [{ method: "email/signup", timestamp: now - 5 }] }, now)).toBe(false);
  });

  it("refuses missing, malformed or future-dated claims", () => {
    expect(signedInByEmailLinkRecently(null, now)).toBe(false);
    expect(signedInByEmailLinkRecently({}, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: "recovery" }, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: [{ method: "recovery" }] }, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: [{ method: "recovery", timestamp: String(now) }] }, now)).toBe(false);
    expect(signedInByEmailLinkRecently({ amr: [{ method: "recovery", timestamp: now + 3600 }] }, now)).toBe(false);
  });

  it("finds the email-link entry among others", () => {
    expect(signedInByEmailLinkRecently({ amr: [{ method: "password", timestamp: now - 9000 }, { method: "otp", timestamp: now - 30 }] }, now)).toBe(true);
  });
});

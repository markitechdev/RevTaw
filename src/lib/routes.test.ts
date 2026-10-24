import { describe, expect, it } from "vitest";

import { routes, safeNextPath, sameSitePath } from "@/lib/routes";

const SITE = "https://revtaw.com";

/** Where a browser would land after redirecting to `path` from RevTaw. */
function landing(path: string): string {
  return new URL(path, `${SITE}/login`).origin;
}

describe("safeNextPath", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/quiz/123?mode=exam#q4")).toBe("/quiz/123?mode=exam#q4");
    expect(safeNextPath("/onboarding?verified=1")).toBe("/onboarding?verified=1");
  });

  it("falls back for empty or missing values", () => {
    expect(safeNextPath(null)).toBe(routes.dashboard);
    expect(safeNextPath(undefined)).toBe(routes.dashboard);
    expect(safeNextPath("")).toBe(routes.dashboard);
    expect(safeNextPath("", "/settings/account")).toBe("/settings/account");
  });

  it.each([
    "https://evil.example/",
    "http://evil.example",
    "javascript:alert(1)",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example/",
    "/\t\\evil.example",
    "\t//evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/\u0000/evil.example",
    "/..//evil.example",
    "/.//evil.example",
    "/dashboard/../..//evil.example",
    "evil.example",
    ` /dashboard`,
  ])("rejects %j", (value) => {
    const result = safeNextPath(value);
    expect(result).toBe(routes.dashboard);
    expect(landing(result)).toBe(SITE);
  });

  it("never returns a target that leaves the site", () => {
    const tricky = ["/%09/evil.example", "/%2F%2Fevil.example", "/@evil.example", "/evil.example:443/", "/?next=//evil.example"];
    for (const value of tricky) {
      expect(landing(safeNextPath(value))).toBe(SITE);
    }
  });

  it("rejects absurdly long values", () => {
    expect(safeNextPath(`/${"a".repeat(3000)}`)).toBe(routes.dashboard);
  });
});

describe("sameSitePath", () => {
  it("keeps paths within RevTaw and drops everything else", () => {
    expect(sameSitePath("/planner?date=2026-10-24#today")).toBe("/planner?date=2026-10-24#today");
    expect(sameSitePath("https://evil.example/phish")).toBeNull();
    expect(sameSitePath("javascript:alert(1)")).toBeNull();
    expect(sameSitePath("//evil.example")).toBeNull();
    expect(sameSitePath("/\t/evil.example")).toBeNull();
    expect(sameSitePath("/..//evil.example")).toBeNull();
    expect(sameSitePath("planner")).toBeNull();
    expect(sameSitePath(null)).toBeNull();
  });
});

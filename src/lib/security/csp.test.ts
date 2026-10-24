import { afterEach, describe, expect, it, vi } from "vitest";

import { buildContentSecurityPolicy, hasOwnContentSecurityPolicy } from "@/lib/security/csp";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildContentSecurityPolicy", () => {
  it("allows scripts only with the nonce, and frames only from RevTaw", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    const policy = directives(buildContentSecurityPolicy("bm9uY2U="));
    expect(policy.get("script-src")).toBe("'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(policy.get("frame-src")).toBe("'self' blob:");
    expect(policy.get("connect-src")).toBe("'self' https://abcdefghijklmnop.supabase.co wss://abcdefghijklmnop.supabase.co");
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("object-src")).toBe("'none'");
  });

  it("lets Cloudflare Turnstile's frame load once a site key is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    const policy = directives(buildContentSecurityPolicy("bm9uY2U="));
    expect(policy.get("frame-src")).toBe("'self' blob: https://challenges.cloudflare.com");
    expect(policy.get("script-src")).toBe("'self' 'nonce-bm9uY2U=' 'strict-dynamic' https://challenges.cloudflare.com");
    expect(policy.get("connect-src")).not.toContain("cloudflare");
  });

  it("upgrades insecure requests only for a production site served over https", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://revtaw.com");
    expect(buildContentSecurityPolicy("n")).toContain("upgrade-insecure-requests");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(buildContentSecurityPolicy("n")).not.toContain("upgrade-insecure-requests");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://revtaw.com");
    const dev = buildContentSecurityPolicy("n");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(directives(dev).get("script-src")).toContain("'unsafe-eval'");
  });
});

describe("hasOwnContentSecurityPolicy", () => {
  it("matches only the original-file route", () => {
    expect(hasOwnContentSecurityPolicy("/api/materials/0b6f1c1e-1111-4a5b-8c9d-0123456789ab/file")).toBe(true);
    expect(hasOwnContentSecurityPolicy("/api/materials/abc/file/")).toBe(true);
    expect(hasOwnContentSecurityPolicy("/api/materials/abc/file/extra")).toBe(false);
    expect(hasOwnContentSecurityPolicy("/api/materials/abc/status")).toBe(false);
    expect(hasOwnContentSecurityPolicy("/materials/abc/file")).toBe(false);
  });
});

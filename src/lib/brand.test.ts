import { describe, expect, it } from "vitest";

import { BRAND } from "@/lib/brand";

describe("the contact icons' links", () => {
  it("are secure links, each on its own site", () => {
    const sites = { facebook: "www.facebook.com", instagram: "www.instagram.com", github: "github.com" };
    expect(BRAND.social.map((link) => link.id)).toEqual(["facebook", "instagram", "github"]);
    for (const link of BRAND.social) {
      const url = new URL(link.href);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe(sites[link.id]);
      expect(url.pathname.length).toBeGreaterThan(1);
    }
  });
});

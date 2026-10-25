import { describe, expect, it } from "vitest";

import { BRAND } from "@/lib/brand";
import { creatorJsonLd, jsonLdText, profilePageJsonLd, websiteJsonLd } from "@/lib/seo";

const site = "https://revtaw.com";

describe("structured data for search engines", () => {
  it("describes the creator once, by full name, with the profiles in the footer", () => {
    const person = creatorJsonLd(site);
    expect(person).toMatchObject({ "@type": "Person", "@id": "https://revtaw.com/about#person", name: "Mark Francis B. Entredicho", alternateName: "Mark Francis Entredicho", url: "https://revtaw.com/about" });
    expect(person.sameAs).toEqual(BRAND.social.map((link) => link.href));
  });

  it("makes the About page the creator's profile page and the website theirs", () => {
    const profile = profilePageJsonLd(site);
    expect(profile).toMatchObject({ "@context": "https://schema.org", "@type": "ProfilePage", url: "https://revtaw.com/about" });
    expect(profile.mainEntity.description).toBe("Developer of RevTaw, an AI-powered study and reviewer platform.");
    const website = websiteJsonLd(site);
    expect(website).toMatchObject({ "@type": "WebSite", name: "RevTaw", url: "https://revtaw.com/" });
    // The same @id: one person, whichever page a search engine reads first.
    expect(website.creator["@id"]).toBe(profile.mainEntity["@id"]);
  });

  it("writes JSON that can't end its script element early", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

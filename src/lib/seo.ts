import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";

/**
 * Structured data (schema.org JSON-LD) that tells search engines who RevTaw is by: the creator as one Person,
 * the About page as their profile page, and the website as made by them. It is what lets a search for the
 * creator's name lead to RevTaw. Every value comes from BRAND, so the page text and the data agree.
 */

const PERSON_FRAGMENT = "#person";

export const CREATOR_DESCRIPTION = `Developer of ${BRAND.name}, an AI-powered study and reviewer platform.`;

/** The creator, with the same @id everywhere so search engines treat every mention as one person. */
export function creatorJsonLd(site: string) {
  return {
    "@type": "Person",
    "@id": `${site}${routes.about}${PERSON_FRAGMENT}`,
    name: BRAND.creatorFullName,
    alternateName: BRAND.creator,
    url: `${site}${routes.about}`,
    sameAs: BRAND.social.map((link) => link.href),
  };
}

/** The About page: a profile page about the creator, who is affiliated with the site (Google's ProfilePage). */
export function profilePageJsonLd(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${site}${routes.about}`,
    mainEntity: { ...creatorJsonLd(site), description: CREATOR_DESCRIPTION },
  };
}

/** The home page: the website, its name and who made it. */
export function websiteJsonLd(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND.name,
    url: `${site}${routes.home}`,
    description: BRAND.description,
    creator: creatorJsonLd(site),
  };
}

/** JSON for a <script type="application/ld+json">: "<" is escaped, so no value can end the script element early. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

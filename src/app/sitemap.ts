import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";
import { LEGAL_VERSION } from "@/lib/legal";
import { routes } from "@/lib/routes";

/** sitemap.xml: the pages anyone can open (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const legal = new Date(`${LEGAL_VERSION}T00:00:00+08:00`);
  return [
    { url: `${site}${routes.home}`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}${routes.about}`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${site}${routes.register}`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${site}${routes.login}`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${site}${routes.privacy}`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}${routes.privacyStudents}`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}${routes.terms}`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
  ];
}

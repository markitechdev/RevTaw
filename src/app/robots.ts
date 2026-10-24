import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";
import { PROTECTED_PREFIXES, routes } from "@/lib/routes";

/**
 * robots.txt: the front page, the sign-up and sign-in pages, the Privacy Notice and the Terms may be
 * listed by search engines; everything behind sign-in, the API and the email-link pages may not.
 * A Vercel preview deployment asks to stay out of search results altogether.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", routes.verifyEmail, routes.resetPassword, ...PROTECTED_PREFIXES],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}

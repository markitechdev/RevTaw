import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SocialLinks } from "@/components/marketing/social-links";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE, SECTION_TITLE } from "@/components/ui/typography";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { CREATOR_DESCRIPTION, profilePageJsonLd } from "@/lib/seo";

/**
 * The creator's page: who develops RevTaw, in words people search for (the full name in the title, heading
 * and first sentence), with ProfilePage structured data and links to their profiles.
 */
export const metadata: Metadata = {
  title: { absolute: `${BRAND.creatorFullName} — Developer of ${BRAND.name}` },
  description: `${BRAND.name} is an AI-powered study and reviewer platform developed by ${BRAND.creatorFullName}.`,
  alternates: { canonical: routes.about },
  openGraph: { type: "profile", title: `${BRAND.creatorFullName} — Developer of ${BRAND.name}`, url: routes.about },
};

export default function AboutPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={profilePageJsonLd(getSiteUrl())} />
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-primary">About</p>
        <h1 className={PAGE_TITLE}>{BRAND.creatorFullName}</h1>
        <p className="text-lg text-muted-foreground">{CREATOR_DESCRIPTION}</p>
      </header>

      <section aria-labelledby="about-revtaw" className="flex flex-col gap-3">
        <h2 id="about-revtaw" className={SECTION_TITLE}>
          {BRAND.name}
        </h2>
        <div className="flex flex-col gap-3 text-reading text-foreground/90">
          <p>
            {BRAND.name} is an AI-powered study and reviewer platform developed by {BRAND.creatorFullName}. It turns your notes, PDFs and screenshots into
            reviewers, quizzes and flashcards, plans what to study next, and brings back the parts you&apos;re about to forget, with Tamari, its study
            buddy, to help.
          </p>
          <p>
            <span lang="fil">{BRAND.motto}</span> {BRAND.tagline}
          </p>
        </div>
        <div>
          <Link href={routes.register} className={buttonClasses({ size: "lg" })}>
            Start studying — it&apos;s free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="online-profiles" className="flex flex-col gap-3">
        <h2 id="online-profiles" className={SECTION_TITLE}>
          Online profiles
        </h2>
        <SocialLinks labeled label="Online profiles" />
      </section>
    </article>
  );
}

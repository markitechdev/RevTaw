import type { Metadata } from "next";
import Link from "next/link";

import { StandaloneFrame } from "@/components/app/standalone-frame";
import { buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE } from "@/components/ui/typography";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Page not found" };

/** A URL RevTaw does not have (signed-in pages that cannot find their item use the app's own not-found). */
export default function NotFound() {
  return (
    <StandaloneFrame>
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className={PAGE_TITLE}>This page does not exist</h1>
      <p className="text-sm text-muted-foreground">The link may be outdated, or the page may have moved. Your materials and progress are safe.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={routes.dashboard} className={buttonClasses({ size: "sm" })}>
          Go to Home
        </Link>
        <Link href={routes.home} className={buttonClasses({ variant: "secondary", size: "sm" })}>
          About RevTaw
        </Link>
      </div>
    </StandaloneFrame>
  );
}

import { Search } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";

/**
 * A signed-in page whose item is gone or is not the student's (a deleted quiz, an old link): shown inside the
 * app shell, with the navigation, instead of the standalone 404 page.
 */
export default function AppNotFound() {
  return (
    <PageHeader
      eyebrow="Not found"
      title="This page does not exist"
      description="It may have been deleted, or the link may be outdated. Your materials and progress are safe."
      actions={
        <>
          <Link href={routes.dashboard} className={buttonClasses({ size: "sm" })}>
            Go to Home
          </Link>
          <Link href={routes.search} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Link>
        </>
      }
    />
  );
}

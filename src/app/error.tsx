"use client";

import Link from "next/link";
import { useEffect } from "react";

import { StandaloneFrame } from "@/components/app/standalone-frame";
import { Button, buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE } from "@/components/ui/typography";
import { routes } from "@/lib/routes";

/**
 * Errors outside the app shell (the landing page, sign-in, onboarding): RevTaw's own page with a way to try
 * again, instead of the framework's plain one. Signed-in pages have their own boundary inside the shell.
 */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StandaloneFrame>
      <h1 className={PAGE_TITLE}>Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Nothing you did caused this. Try again in a moment.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" onClick={retry}>
          Try again
        </Button>
        <Link href={routes.home} className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Go to the front page
        </Link>
      </div>
    </StandaloneFrame>
  );
}

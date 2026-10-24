"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { routes } from "@/lib/routes";

/** Error boundary for signed-in pages. Keeps the shell, replaces the page. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      titleAs="h1"
      title="This page could not be loaded"
      description="Nothing you did caused this. Try again, or head back to Home."
      action={
        <>
          {/* Fetches the page again, not just a re-render of what failed. */}
          <Button type="button" variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
          <Link href={routes.dashboard} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Go to Home
          </Link>
        </>
      }
    />
  );
}

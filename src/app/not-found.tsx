import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE } from "@/components/ui/typography";
import { routes } from "@/lib/routes";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-primary">404</p>
          <h1 className={PAGE_TITLE}>This page does not exist</h1>
          <p className="text-sm text-muted-foreground">
            The link may be outdated, or the page may have moved. Your materials and progress are
            safe.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={routes.dashboard} className={buttonClasses({ size: "sm" })}>
              Go to Home
            </Link>
            <Link href={routes.home} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

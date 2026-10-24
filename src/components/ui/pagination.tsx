import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Previous and Next under a long list, with where the student is ("25–48 of
 * 312 materials", "Page 2 of 13"). Plain links, so every page has its own
 * address and works without JavaScript. Renders nothing when everything fits
 * on one page.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  noun,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** What is listed, plural ("materials"), for the summary and the navigation's name. */
  noun: string;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const quiet = "pointer-events-none opacity-50";
  return (
    <nav aria-label={`Pages of ${noun}`} className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-sm text-muted-foreground">
        {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {noun}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} rel="prev" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous<span className="sr-only"> page</span>
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses({ variant: "secondary", size: "sm", className: quiet })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous<span className="sr-only"> page</span>
          </span>
        )}
        <span className="px-1 text-sm tabular-nums text-muted-foreground" aria-current="page">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} rel="next" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Next<span className="sr-only"> page</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses({ variant: "secondary", size: "sm", className: quiet })}>
            Next<span className="sr-only"> page</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}

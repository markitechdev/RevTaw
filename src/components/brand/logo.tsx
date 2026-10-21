import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The RevTaw mark: an open book whose pages form a check — "delivers". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
    >
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M8 10.5c2.6-1.2 5.3-1.2 8 0v12c-2.7-1.2-5.4-1.2-8 0v-12Z"
        className="fill-brand-foreground"
        opacity="0.55"
      />
      <path
        d="M16 10.5c2.6-1.2 5.3-1.2 8 0v12c-2.7-1.2-5.4-1.2-8 0v-12Z"
        className="fill-brand-foreground"
      />
      <path
        d="M11.5 16.5l2.2 2.2 4.3-4.6"
        className="stroke-brand"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  withTagline = false,
}: {
  href?: string;
  className?: string;
  withTagline?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <LogoMark />
      {/* The visible wordmark is the link's accessible name (WCAG 2.5.3 label in name). */}
      <span className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight text-foreground">
          {BRAND.name}
        </span>
        {withTagline && (
          <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {BRAND.motto}
          </span>
        )}
      </span>
    </Link>
  );
}

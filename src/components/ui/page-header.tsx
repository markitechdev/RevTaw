import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export type BackTarget = { href: string; label: ReactNode };

/** "← Notes": the way back to the page this one sits under. A long label is cut short, never wrapped. */
export function BackLink({ href, label }: BackTarget) {
  return (
    <Link href={href} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 max-w-full self-start" })}>
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Title block used at the top of every app page. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** For a page under another one (Mastery map under Progress). */
  back?: BackTarget;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {back && <BackLink {...back} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
          <h1 className={PAGE_TITLE}>{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Title block of one thing's own page (a material, a reviewer, a quiz, a deck, a quiz's results): the way
 * back, its badges, the same page title as every other page, a line about it, and its actions below.
 */
export function DetailHeader({
  back,
  badges,
  title,
  meta,
  status,
  children,
  actions,
}: {
  back: BackTarget;
  badges?: ReactNode;
  title: ReactNode;
  /** One muted line: where it came from, when it was made. */
  meta?: ReactNode;
  /** Its state, right under the line (a status badge, a progress note). */
  status?: ReactNode;
  /** Notices about it (archived, deleted), above the actions. */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <BackLink {...back} />
      <div className="flex flex-col gap-2">
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        <h1 className={PAGE_TITLE}>{title}</h1>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        {status}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

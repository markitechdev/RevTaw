import type { ReactNode } from "react";

import { TEXT_LINK } from "@/components/ui/text-link";
import { PAGE_TITLE, SECTION_TITLE } from "@/components/ui/typography";
import { LEGAL_UPDATED, PROCESSORS } from "@/lib/legal";
import { cn } from "@/lib/utils";

export type LegalHeading = { id: string; title: string };

/**
 * The frame of the Privacy Notice, its student version and the Terms of Use: the page title with the date it
 * last changed, an opening, an optional notice, the list of sections, then the sections themselves.
 */
export function LegalDocument({
  eyebrow,
  title,
  intro,
  notice,
  contents,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** A box under the opening: where the other version is, who should read it too. */
  notice?: ReactNode;
  /** The sections, for "On this page"; left out on a short page. */
  contents?: LegalHeading[];
  children: ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 className={PAGE_TITLE}>{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <div className="flex flex-col gap-3 text-reading text-foreground/90">{intro}</div>
      </header>
      {notice}
      {contents && (
        <nav aria-label="On this page" className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">On this page</p>
          {/* Columns, not a grid, so the numbers run down the first column before the second. */}
          <ol className="mt-2 list-decimal gap-x-8 pl-5 text-sm marker:text-muted-foreground sm:columns-2">
            {contents.map((heading) => (
              <li key={heading.id} className="break-inside-avoid py-0.5">
                <a href={`#${heading.id}`} className="text-primary underline-offset-4 hover:underline">
                  {heading.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-10">{children}</div>
    </article>
  );
}

/** One numbered part of a legal page; its id is the anchor "On this page" links to. */
export function LegalSection({ heading, children }: { heading: LegalHeading; children: ReactNode }) {
  return (
    <section id={heading.id} aria-labelledby={`${heading.id}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={`${heading.id}-title`} className={SECTION_TITLE}>
        {heading.title}
      </h2>
      <div className="flex flex-col gap-3 text-reading text-foreground/90">{children}</div>
    </section>
  );
}

export function LegalList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground", className)}>{children}</ul>;
}

/** The companies that process students' information, with what each one gets and its own policy. */
export function ProcessorList() {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {PROCESSORS.map((processor) => (
        <li key={processor.name} className="flex flex-col gap-1 p-4">
          <p className="font-semibold text-foreground">{processor.name}</p>
          {processor.only && <p className="text-sm font-medium text-muted-foreground">{processor.only}</p>}
          <p>{processor.does}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Gets:</span> {processor.receives}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {processor.policies.map((policy) => (
              <a key={policy.href} href={policy.href} rel="noopener noreferrer" target="_blank" className={TEXT_LINK}>
                {policy.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

import { Clock, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SECTION_TITLE } from "@/components/ui/typography";
import { routes } from "@/lib/routes";
import { isBuilderMethod, METHOD_BEHAVIOUR } from "@/lib/study/catalog";
import { STUDY_METHODS } from "@/lib/study/methods";

export const metadata: Metadata = {
  title: "Study Methods",
};

function startHref(id: string): string | null {
  if (id === "flashcards") return routes.flashcards;
  if (id === "spaced_repetition") return `${routes.flashcards}/review`;
  if (id === "cornell_notes") return routes.notes;
  if (id === "custom_routine") return `${routes.study}#routines`;
  if (isBuilderMethod(id)) return `${routes.study}?method=${id}`;
  return null;
}

/** Study method engine (§15): every method with what it does, when to use it and a real Start button. */
export default function MethodsPage() {
  const available = STUDY_METHODS.filter((method) => METHOD_BEHAVIOUR[method.id].availableIn === "now");
  const upcoming = STUDY_METHODS.filter((method) => METHOD_BEHAVIOUR[method.id].availableIn !== "now");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Study Methods"
        description="Pick a method and the session changes with it: what stays hidden, what you are asked, how answers are checked and what gets scheduled next."
        actions={
          <Link href={routes.study} className={buttonClasses({ size: "sm" })}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Open session builder
          </Link>
        }
      />

      <section aria-labelledby="available-heading" className="flex flex-col gap-3">
        <h2 id="available-heading" className={SECTION_TITLE}>
          {upcoming.length > 0 ? "Available now" : `All ${available.length} methods`}
        </h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {available.map((method) => {
            const behavior = METHOD_BEHAVIOUR[method.id];
            const href = startHref(method.id);
            return (
              <li key={method.id}>
                <Card className="flex h-full flex-col">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold tracking-display">{method.name}</h3>
                      <Badge tone="neutral">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {behavior.suggestedMinutes} min
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground/90">{method.summary}</p>
                    <dl className="grid grid-cols-1 gap-2 text-sm">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How it helps</dt>
                        <dd>{behavior.howItHelps}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best for</dt>
                        <dd>{behavior.bestUseCases}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In a session</dt>
                        <dd className="text-muted-foreground">{behavior.behavior}</dd>
                      </div>
                    </dl>
                    {href && (
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                        <Link href={href} className={buttonClasses({ size: "sm" })}>
                          <Play className="h-4 w-4" aria-hidden="true" />
                          Start session
                        </Link>
                        {behavior.requiresMaterial && <span className="text-xs text-muted-foreground">Pick the material in the next step.</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
          <h2 id="upcoming-heading" className={SECTION_TITLE}>
            Coming in later phases
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((method) => {
              const behavior = METHOD_BEHAVIOUR[method.id];
              return (
                <li key={method.id} className="rounded-xl border border-dashed border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{method.name}</h3>
                    <Badge tone="neutral">{behavior.availableIn}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{method.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Best for: {behavior.bestUseCases}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

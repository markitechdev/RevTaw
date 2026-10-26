import { ArrowRight, Map } from "lucide-react";
import Link from "next/link";

import { MasteryBar, STATUS_TONE } from "@/components/adaptive/mastery-table";
import { StatusStrip } from "@/components/analytics/charts";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SECTION_TITLE } from "@/components/ui/typography";
import { STATUS_LABEL } from "@/lib/adaptive/mastery";
import type { MasteryMap as MasteryMapData } from "@/lib/analytics/map";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Mastery map (§24): subject → material → concept with the percentage and
 * status, and the recommended session one click away for every concept.
 */
export function MasteryMapView({ map }: { map: MasteryMapData }) {
  if (map.total === 0) {
    return (
      <EmptyState
        icon={Map}
        title="Nothing on the map yet"
        description="Every answered question places its concept here. Take a quiz or an active recall session to start the map."
        action={
          <Link href={routes.study} className={buttonClasses({ size: "sm" })}>
            Start a session
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <StatusStrip title={`${map.total} concept${map.total === 1 ? "" : "s"} by status`} counts={map.counts} labels={STATUS_LABEL} />
      {map.subjects.map((subject) => (
        <section key={subject.id ?? "none"} aria-labelledby={`subject-${subject.id ?? "none"}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`subject-${subject.id ?? "none"}`} className={SECTION_TITLE}>
              {subject.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {subject.concepts} concept{subject.concepts === 1 ? "" : "s"}
                {subject.averageMastery !== null ? ` · average ${subject.averageMastery}%` : ""}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {subject.materials.map((material) => (
              <article key={material.id ?? "none"} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby={`material-${material.id ?? "none"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id={`material-${material.id ?? "none"}`} className="font-medium">
                    {material.href ? (
                      <Link href={material.href} className="hover:underline">
                        {material.title}
                      </Link>
                    ) : (
                      material.title
                    )}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {material.averageMastery !== null ? `average ${material.averageMastery}%` : ""} · {material.counts.mastered} mastered · {material.weakTopics} weak
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-border">
                  {material.concepts.map((concept) => (
                    <li key={concept.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{concept.name}</span>
                          <Badge tone={STATUS_TONE[concept.status]}>{STATUS_LABEL[concept.status]}</Badge>
                          {concept.misconceptions > 0 && <Badge tone="danger">misconception</Badge>}
                        </div>
                        <MasteryBar value={concept.mastery} status={concept.status} />
                      </div>
                      <Link
                        href={concept.recommendation.href}
                        className={cn(buttonClasses({ size: "sm", variant: concept.status === "weak" || concept.status === "learning" ? "primary" : "secondary" }), "shrink-0 self-start sm:self-auto")}
                        title={concept.recommendation.reason}
                        aria-label={`${concept.recommendation.label} for ${concept.name}: ${concept.recommendation.reason}`}
                      >
                        {concept.recommendation.label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

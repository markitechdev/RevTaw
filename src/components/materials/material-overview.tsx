import { BookOpen, Clock, Gauge, Lightbulb, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { ReanalyzeButton } from "@/components/materials/reanalyze-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CONCEPT_CATEGORY_LABEL, type ConceptCategory } from "@/lib/materials/analysis-schema";
import type { MaterialAnalysisView } from "@/lib/materials/queries";
import { formatSessionMinutes } from "@/lib/profile/options";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";
import type { MaterialStatus } from "@/lib/supabase/database.types";

const DIFFICULTY_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;
const CATEGORY_ORDER: ConceptCategory[] = ["understanding", "memorization", "calculation", "application"];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * What RevTaw found in the material (spec §14): topics, concepts by type,
 * definitions, formulas, facts, likely exam topics and recommended methods.
 */
export function MaterialOverview({
  materialId,
  status,
  statusDetail,
  analysis,
}: {
  materialId: string;
  status: MaterialStatus;
  statusDetail: string | null;
  analysis: MaterialAnalysisView | null;
}) {
  if (!analysis) {
    const inFlight = status === "extracting" || status === "analyzing" || status === "uploading";
    return (
      <EmptyState
        icon={Sparkles}
        title={inFlight ? "Analysis in progress" : "No analysis yet"}
        description={
          inFlight
            ? "RevTaw is reading the material and picking out topics, definitions and formulas."
            : statusDetail ?? "Run the analysis to see topics, key concepts, definitions and recommended study methods."
        }
        action={status === "ready" || status === "failed" ? <ReanalyzeButton materialId={materialId}>Analyze now</ReanalyzeButton> : undefined}
      />
    );
  }

  const { data } = analysis;
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: data.key_concepts.filter((concept) => concept.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary-soft/40">
        <CardContent className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-foreground">{analysis.summary}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">
              <Gauge className="h-3 w-3" aria-hidden="true" />
              {DIFFICULTY_LABEL[analysis.difficulty]}
            </Badge>
            <Badge tone="primary">
              <Clock className="h-3 w-3" aria-hidden="true" />
              About {formatSessionMinutes(analysis.estimatedStudyMinutes)} to study
            </Badge>
            {data.subject_guess && (
              <Badge tone="neutral">
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                {data.subject_guess}
              </Badge>
            )}
            {analysis.coverageRatio < 1 && (
              <Badge tone="warning">Covers the first {Math.round(analysis.coverageRatio * 100)}% of the text</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {data.recommended_methods.length > 0 && (
        <Section
          title="Recommended study methods"
          description="Chosen from what this material needs. Study sessions that use them arrive in the next phase."
        >
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.recommended_methods.map((item) => {
              const method = STUDY_METHOD_BY_ID[item.method];
              return (
                <li key={item.method} className="flex gap-3 rounded-lg border border-border p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{method?.name ?? item.method}</p>
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.main_topics.length > 0 && (
          <Section title="Main topics" description="In the order they appear.">
            <ol className="flex flex-col gap-2">
              {data.main_topics.map((topic, index) => (
                <li key={`${topic.title}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{topic.title}</p>
                    {topic.description && <p className="text-sm text-muted-foreground">{topic.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {data.exam_topics.length > 0 && (
          <Section title="Possible exam topics" description="What an examiner is most likely to ask about.">
            <ul className="flex flex-col gap-2">
              {data.exam_topics.map((item, index) => (
                <li key={`${item.topic}-${index}`}>
                  <p className="font-medium">{item.topic}</p>
                  {item.why && <p className="text-sm text-muted-foreground">{item.why}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {grouped.length > 0 && (
        <Section title="Key concepts" description="Grouped by what mastering each one mostly needs.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {grouped.map((group) => (
              <div key={group.category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CONCEPT_CATEGORY_LABEL[group.category]}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.items.map((concept, index) => (
                    <li key={`${concept.name}-${index}`} className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className="font-medium">{concept.name}</p>
                      <p className="text-sm text-muted-foreground">{concept.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.definitions.length > 0 && (
          <Section title="Definitions" description="Exactly as the material states them.">
            <dl className="flex flex-col gap-3">
              {data.definitions.map((item, index) => (
                <div key={`${item.term}-${index}`}>
                  <dt className="font-medium">{item.term}</dt>
                  <dd className="text-sm text-muted-foreground">{item.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {data.formulas.length > 0 && (
          <Section title="Formulas">
            <ul className="flex flex-col gap-3">
              {data.formulas.map((item, index) => (
                <li key={`${item.expression}-${index}`}>
                  {item.name && <p className="text-sm font-medium">{item.name}</p>}
                  <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">{item.expression}</code>
                  {item.meaning && <p className="mt-1 text-sm text-muted-foreground">{item.meaning}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {data.important_facts.length > 0 && (
        <Section title="Important facts" description="Dates, numbers, processes and relationships worth remembering.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {data.important_facts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Analyzed with {analysis.provider} ({analysis.model}) ·{" "}
          {new Date(analysis.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          {statusDetail ? ` · ${statusDetail}` : ""}
        </span>
        <ReanalyzeButton materialId={materialId} />
      </div>
    </div>
  );
}

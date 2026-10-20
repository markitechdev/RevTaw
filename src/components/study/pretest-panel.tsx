import { ArrowRight, ClipboardCheck, Eye, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Before-and-after assessment (§16): what the pre-test found, what to pay
 * attention to, and the per-concept change once the post-test is in.
 * Server-safe markup, shared by the plan page and the finished summary.
 */

export type ConceptChangeView = { concept: string; before: number | null; after: number | null };

export function BeforeAfterTable({ changes, className }: { changes: ConceptChangeView[]; className?: string }) {
  if (changes.length === 0) return null;
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Accuracy per concept before and after studying</caption>
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Concept
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Pre-test
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Post-test
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const delta = change.before !== null && change.after !== null ? change.after - change.before : null;
            return (
              <tr key={change.concept} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {change.concept}
                </th>
                <td className="px-3 py-2 tabular-nums">{change.before === null ? "—" : `${change.before}%`}</td>
                <td className="px-3 py-2 tabular-nums">{change.after === null ? "—" : `${change.after}%`}</td>
                <td className={cn("px-3 py-2 tabular-nums", delta !== null && delta > 0 && "text-success", delta !== null && delta < 0 && "text-danger")}>
                  {delta === null ? "—" : (
                    <span className="inline-flex items-center gap-1">
                      {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      {delta > 0 ? "+" : ""}
                      {delta} pts
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PreTestPanel({ pretest, posttest, changes }: { pretest: { preScore: number; attention: string[]; concepts: string[] } | null; posttest: { postScore: number } | null; changes: ConceptChangeView[] }) {
  if (!pretest) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="flex items-start gap-2">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">Pre-test → study → post-test.</span> Take the short diagnostic first. RevTaw then tells you which concepts to pay attention to, aims the study block at them, and retests the same concepts at the end to show your improvement.
          </span>
        </p>
      </div>
    );
  }
  const improvement = posttest ? posttest.postScore - pretest.preScore : null;
  return (
    <section aria-labelledby="pretest-heading" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/20 p-4 text-sm">
      <h2 id="pretest-heading" className="flex items-center gap-2 font-medium">
        <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
        {posttest ? "Before and after" : "What to pay attention to"}
      </h2>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Pre-test</dt>
          <dd className="text-lg font-semibold tabular-nums">{pretest.preScore}%</dd>
        </div>
        {posttest && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Post-test</dt>
              <dd className="text-lg font-semibold tabular-nums">{posttest.postScore}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Improvement</dt>
              <dd className={cn("text-lg font-semibold tabular-nums", improvement !== null && improvement > 0 && "text-success", improvement !== null && improvement < 0 && "text-danger")}>
                {improvement !== null && improvement > 0 ? "+" : ""}
                {improvement} pts
              </dd>
            </div>
          </>
        )}
      </dl>
      {!posttest && (
        <p>
          {pretest.attention.length ? (
            <>
              Pay attention to{" "}
              <span className="font-medium">
                {pretest.attention.join(", ")}
              </span>{" "}
              while you study — the pre-test missed {pretest.attention.length === 1 ? "it" : "them"}. The post-test will ask about {pretest.concepts.length === 1 ? "the same concept" : `the same ${pretest.concepts.length} concepts`}.
            </>
          ) : (
            "Nothing was missed on the pre-test. Use the study block to make it stick; the post-test asks about the same concepts."
          )}
          <ArrowRight className="ml-1 inline h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </p>
      )}
      <BeforeAfterTable changes={changes} className="bg-card" />
    </section>
  );
}

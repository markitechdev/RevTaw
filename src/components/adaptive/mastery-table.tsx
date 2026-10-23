import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";

import { formatDue } from "@/components/study/session-summary";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { MasteryView } from "@/lib/adaptive/engine";
import { DIFFICULTY_LABEL, NEXT_STEP_LABEL, needsRefresh, STATUS_LABEL } from "@/lib/adaptive/mastery";
import { routes } from "@/lib/routes";
import type { MasteryStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<MasteryStatus, BadgeTone> = {
  new: "neutral",
  weak: "danger",
  learning: "warning",
  developing: "developing",
  strong: "info",
  mastered: "success",
};

const STATUS_FILL: Record<MasteryStatus, string> = {
  new: "bg-danger",
  weak: "bg-danger",
  learning: "bg-warning",
  developing: "bg-developing",
  strong: "bg-info",
  mastered: "bg-success",
};

function barColor(status: MasteryStatus): string {
  return STATUS_FILL[status];
}

/** Mastery indicator (§52): a labelled bar that reads the same everywhere. */
export function MasteryBar({ value, status, compact = false }: { value: number; status: MasteryStatus; compact?: boolean }) {
  const percent = Math.round(Number(value));
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn("h-2 overflow-hidden rounded-full bg-muted", compact ? "w-16" : "w-24 sm:w-32")}
        role="progressbar"
        aria-label="Mastery"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${percent}%, ${STATUS_LABEL[status]}`}
      >
        <div className={cn("h-full rounded-full", barColor(status))} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}

/** Concept-level mastery table (§23 progress tracking, §28 adaptive engine). */
export function MasteryTable({ rows }: { rows: MasteryView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Concept</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2 font-semibold">Mastery</th>
            <th scope="col" className="px-3 py-2 font-semibold">Recall strength</th>
            <th scope="col" className="px-3 py-2 font-semibold">Answers</th>
            <th scope="col" className="px-3 py-2 font-semibold">Trend</th>
            <th scope="col" className="px-3 py-2 font-semibold">Next difficulty</th>
            <th scope="col" className="px-3 py-2 font-semibold">Next review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const trend = Number(row.trend);
            return (
              <tr key={row.id} className="bg-card">
                <td className="px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{row.concept?.name ?? "Concept"}</span>
                    {row.concept?.material && (
                      <Link href={`${routes.materials}/${row.concept.material.id}`} className="truncate text-xs text-muted-foreground hover:underline">
                        {row.concept.material.title}
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    {needsRefresh(row) ? (
                      <span className="text-xs text-muted-foreground">Was {STATUS_LABEL[row.best_status!].toLowerCase()}: a quick review brings it back</span>
                    ) : row.next_step && row.attempts > 0 ? (
                      <span className="text-xs text-muted-foreground">Next step: {NEXT_STEP_LABEL[row.next_step]}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <MasteryBar value={Number(row.mastery)} status={row.status} />
                </td>
                <td className="px-3 py-2 tabular-nums">{Math.round(Number(row.retrieval_strength))}%</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.correct}/{row.attempts}
                  {row.misconceptions > 0 && (
                    <span className="ml-1 text-xs text-danger" title="Wrong answers given with high confidence">
                      · {row.misconceptions} confident miss{row.misconceptions === 1 ? "" : "es"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex items-center gap-1 text-xs", trend > 0 ? "text-success" : trend < 0 ? "text-danger" : "text-muted-foreground")}>
                    {trend > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : trend < 0 ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                    {trend > 0 ? "+" : ""}
                    {Math.round(trend)}
                  </span>
                </td>
                <td className="px-3 py-2">{DIFFICULTY_LABEL[row.next_difficulty]}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.next_review_at ? formatDue(row.next_review_at) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

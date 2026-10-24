import { Brain } from "lucide-react";
import Link from "next/link";

import { MasteryBar, STATUS_TONE } from "@/components/adaptive/mastery-table";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MasteryView } from "@/lib/adaptive/engine";
import { MASTERY_THRESHOLD, STATUS_LABEL } from "@/lib/adaptive/mastery";
import { ENGINE } from "@/lib/engine/config";
import { routes } from "@/lib/routes";

/** Per-material mastery summary for the material overview (§23: progress per material). */
export function MaterialMastery({ materialId, rows, studyable = true }: { materialId: string; rows: MasteryView[]; /** False once the file is deleted: no new sessions from it. */ studyable?: boolean }) {
  const practiced = rows.filter((row) => row.attempts > 0).sort((a, b) => Number(a.mastery) - Number(b.mastery));
  if (practiced.length === 0) return null;
  const average = Math.round(practiced.reduce((sum, row) => sum + Number(row.mastery), 0) / practiced.length);
  const mastered = practiced.filter((row) => row.status === "mastered").length;
  const weak = practiced.filter((row) => row.status === "weak" || row.status === "learning" || Number(row.weakness) >= ENGINE.weakness.flagAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
          Your mastery of this material
        </CardTitle>
        <CardDescription>
          {mastered} of {practiced.length} practiced concept{practiced.length === 1 ? "" : "s"} mastered (≥ {MASTERY_THRESHOLD}%) · average {average}%.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {practiced.slice(0, 8).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{row.concept?.name ?? "Concept"}</span>
                <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              </span>
              <MasteryBar value={Number(row.mastery)} status={row.status} compact />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          {studyable && weak.length > 0 && (
            <Link href={`${routes.study}?method=active_recall&material=${materialId}`} className={buttonClasses({ size: "sm" })}>
              Recall the {weak.length} weak concept{weak.length === 1 ? "" : "s"}
            </Link>
          )}
          <Link href={routes.progress} className={buttonClasses({ size: "sm", variant: "secondary" })}>
            Full progress
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

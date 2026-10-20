import { Clock, Sparkles } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import type { Recommendation } from "@/lib/adaptive/recommend";
import { methodName } from "@/lib/study/catalog";

/** Recommendations with the reason each method was chosen (§15, §22, §28). */
export function RecommendationList({ items, compact = false }: { items: Recommendation[]; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">
              {index === 0 ? <Sparkles className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              {!compact && <p className="text-sm text-muted-foreground">{item.reason}</p>}
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {item.minutes} min · {methodName(item.method)}
              </p>
            </div>
          </div>
          <Link href={item.href} className={buttonClasses({ size: "sm", variant: index === 0 ? "primary" : "secondary", className: "shrink-0" })}>
            Start
          </Link>
        </li>
      ))}
    </ol>
  );
}

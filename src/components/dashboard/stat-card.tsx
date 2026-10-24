import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

type StatProps = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** A unit set smaller after the number ("days", "min"). */
  unit?: string;
  /** One plain-language line under the number. */
  caption?: ReactNode;
  children?: ReactNode;
};

/** The inside of every stat: a label with its icon, a big number (and its unit) and a short line. */
export function StatBody({ icon: Icon, label, value, unit, caption, children, labelAs: Label = "p" }: StatProps & { labelAs?: "p" | "h2" | "h3" }) {
  return (
    <>
      <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </Label>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold leading-none tracking-display tabular-nums text-foreground">{value}</span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {caption && <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>}
      {children}
    </>
  );
}

/** A stat on its own card (Progress, an exam's plan): the same inside as the tiles on Home. */
export function StatCard(props: StatProps) {
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <StatBody {...props} />
    </Card>
  );
}

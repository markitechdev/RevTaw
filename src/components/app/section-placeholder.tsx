import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";

/**
 * Honest placeholder for sections that arrive in a later phase: says what the
 * section will do and points to something useful the student can do today.
 */
export function SectionPlaceholder({
  title,
  description,
  icon,
  phase,
  emptyTitle,
  emptyDescription,
  action,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: string;
  emptyTitle: string;
  emptyDescription: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`Coming in ${phase}`} title={title} description={description} />
      <EmptyState
        icon={icon}
        title={emptyTitle}
        description={emptyDescription}
        action={
          action ?? (
            <Link href={routes.materials} className={buttonClasses({ size: "sm" })}>
              Go to Materials
            </Link>
          )
        }
      />
    </div>
  );
}

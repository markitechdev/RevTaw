import Link from "next/link";

import { cn } from "@/lib/utils";

export type MaterialTab = { id: string; label: string; count?: number };

/** Link-based tabs (server-rendered, linkable) for the material viewer. */
export function MaterialTabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: MaterialTab[];
  active: string;
  hrefFor: (tabId: string) => string;
}) {
  return (
    <nav aria-label="Material sections" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 border-b border-border px-1">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={hrefFor(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {typeof tab.count === "number" && (
                  <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{tab.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav-items";
import { cn } from "@/lib/utils";

const SECTIONS = {
  primary: PRIMARY_NAV,
  secondary: SECONDARY_NAV,
} as const;

/**
 * Vertical list of navigation links with the current page highlighted.
 * Items are resolved here (a Client Component) because icon components cannot
 * cross the server/client boundary as props.
 */
export function SidebarNav({
  section,
  label,
  onNavigate,
  className,
}: {
  section: keyof typeof SECTIONS;
  label: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const items = SECTIONS[section];

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { activeHref, navLayout, SETTINGS_ITEM, type NavItem } from "@/components/app/nav-items";
import type { ToolId } from "@/lib/preferences/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

function NavLink({ item, active, onNavigate, compact = false }: { item: NavItem; active: boolean; onNavigate?: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        compact ? "py-1.5" : "py-2",
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110", active && "scale-110")} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * The app navigation (UI phase §9, §12): Home and the pinned tools in Main,
 * Create and Learn, then More Tools with everything else and a shortcut to
 * choose what is pinned. Used by the sidebar and the phone menu.
 */
export function SidebarNav({ pinned, onNavigate, className }: { pinned: readonly ToolId[]; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const baseId = useId();
  const layout = navLayout(pinned);
  const active = activeHref(pathname, [...layout.groups.flatMap((group) => group.items), ...layout.more]);
  const moreActive = layout.more.some((item) => item.href === active);
  // Open while the current page is one of the More tools, until the student toggles it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const moreOpen = toggled ?? moreActive;

  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-4", className)}>
      {layout.groups.map((group) => {
        const labelId = `${baseId}-${group.id}`;
        return (
          <div key={group.id}>
            <p id={labelId} className={cn("px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", group.id === "main" && "sr-only")}>
              {group.label}
            </p>
            <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink item={item} active={item.href === active} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={`${baseId}-more`}
          onClick={() => setToggled(!moreOpen)}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            More tools
            {moreActive && !moreOpen && (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                <span className="sr-only">(the current page is here)</span>
              </>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", moreOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <div id={`${baseId}-more`} hidden={!moreOpen} className="mt-1">
          {layout.more.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {layout.more.map((item) => (
                <li key={item.id}>
                  <NavLink item={item} active={item.href === active} onNavigate={onNavigate} compact />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-1 text-xs text-muted-foreground">Every tool is pinned.</p>
          )}
          <Link
            href={routes.settingsTools}
            onClick={onNavigate}
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Customize RevTaw
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** Settings, at the bottom of the sidebar and the phone menu. */
export function AccountNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account">
      <NavLink item={SETTINGS_ITEM} active={pathname === SETTINGS_ITEM.href || pathname.startsWith(`${SETTINGS_ITEM.href}/`)} onNavigate={onNavigate} />
    </nav>
  );
}

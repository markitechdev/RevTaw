"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { activeHref, mobileTabs, navLayout } from "@/components/app/nav-items";
import { AccountNav, SidebarNav } from "@/components/app/sidebar-nav";
import { Logo } from "@/components/brand/logo";
import type { ToolId } from "@/lib/preferences/options";
import { cn } from "@/lib/utils";

/**
 * Compact navigation for small screens: a bottom tab bar with Home and the
 * first pinned tools plus a "Menu" tab that opens a drawer with everything.
 * The drawer is a native <dialog>, which gives focus trapping and Escape for
 * free. Hidden on large screens, where the sidebar takes over.
 */
export function MobileNav({ userCard, pinned }: { userCard: ReactNode; pinned: readonly ToolId[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const tabs = mobileTabs(pinned);
  const layout = navLayout(pinned);
  const active = activeHref(pathname, [...layout.groups.flatMap((group) => group.items), ...layout.more]);
  const elsewhere = active !== null && !tabs.some((tab) => tab.href === active);

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  // Close the drawer whenever the route changes (e.g. browser back button).
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const current = tab.href === active;
            const Icon = tab.icon;
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", current ? "text-primary" : "text-muted-foreground")}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", current && "bg-primary-soft")}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={open}
              aria-haspopup="dialog"
              className={cn("flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium", elsewhere ? "text-primary" : "text-muted-foreground")}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", elsewhere && "bg-primary-soft")}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </span>
              Menu
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        aria-label="Navigation menu"
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className={cn("fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-80 max-w-[85vw] bg-card p-0 text-foreground shadow-pop", "backdrop:bg-black/40 open:flex open:flex-col open:animate-panel-in")}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Logo />
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav pinned={pinned} onNavigate={close} />
          <div className="my-3 border-t border-border" />
          <AccountNav onNavigate={close} />
        </div>
        <div className="border-t border-border px-4 py-4">{userCard}</div>
      </dialog>
    </>
  );
}

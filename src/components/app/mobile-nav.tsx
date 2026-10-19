"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { isActivePath, MOBILE_TABS } from "@/components/app/nav-items";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Compact navigation for small screens: a bottom tab bar with the four most
 * used destinations plus a "Menu" tab that opens a drawer with everything.
 * The drawer is a native <dialog>, which gives focus trapping and Escape for
 * free. Hidden on large screens, where the sidebar takes over.
 */
export function MobileNav({ userCard }: { userCard: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  // Close the drawer whenever the route changes (e.g. browser back button).
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const active = isActivePath(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
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
              className="flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
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
        className={cn(
          "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-80 max-w-[85vw] bg-card p-0 text-foreground shadow-xl",
          "backdrop:bg-black/40 open:flex open:flex-col",
        )}
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
          <SidebarNav section="primary" label="All sections" onNavigate={close} />
          <div className="my-3 border-t border-border" />
          <SidebarNav section="secondary" label="Account" onNavigate={close} />
        </div>
        <div className="border-t border-border px-4 py-4">{userCard}</div>
      </dialog>
    </>
  );
}

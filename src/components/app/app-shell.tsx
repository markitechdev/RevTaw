import type { ReactNode } from "react";

import { CommandMenu, CommandMenuIconButton, CommandMenuTrigger } from "@/components/app/command-menu";
import { MobileNav } from "@/components/app/mobile-nav";
import { AccountNav, SidebarNav } from "@/components/app/sidebar-nav";
import { UserCard } from "@/components/app/user-card";
import { Logo } from "@/components/brand/logo";
import type { ToolId } from "@/lib/preferences/schema";
import { routes } from "@/lib/routes";

/**
 * Responsive frame for signed-in screens: a fixed sidebar on large screens,
 * a slim top bar plus bottom tab bar (with a full-menu drawer) on small ones.
 */
export function AppShell({
  displayName,
  email,
  pinned,
  notifications,
  children,
}: {
  displayName: string;
  email: string | null;
  /** Tools pinned to the navigation (Settings → RevTaw tools). */
  pinned: readonly ToolId[];
  /** Server-rendered notifications bell (see NotificationsMenu). */
  notifications?: ReactNode;
  children: ReactNode;
}) {
  const userCard = <UserCard displayName={displayName} email={email} />;

  return (
    <div className="min-h-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to content
      </a>

      <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <Logo href={routes.dashboard} withTagline />
          {notifications}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="mb-4 px-1">
            <CommandMenuTrigger />
          </div>
          <SidebarNav pinned={pinned} />
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <AccountNav />
          <div className="px-1">{userCard}</div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur lg:hidden">
          <Logo href={routes.dashboard} />
          <div className="flex items-center gap-1">
            <CommandMenuIconButton />
            {notifications}
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 pb-24 outline-none sm:px-6 lg:px-8 lg:py-8 lg:pb-10"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <MobileNav userCard={userCard} pinned={pinned} />
        <CommandMenu />
      </div>
    </div>
  );
}

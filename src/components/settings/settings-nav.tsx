"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    label: "Account",
    items: [
      { href: routes.settingsProfile, label: "Profile" },
      { href: routes.settingsAccount, label: "Account" },
    ],
  },
  {
    label: "Preferences",
    items: [
      { href: routes.settingsAppearance, label: "Appearance" },
      { href: routes.settingsDashboard, label: "Home page" },
      { href: routes.settingsTools, label: "RevTaw tools" },
      { href: routes.settingsAi, label: "Tamari & AI" },
      { href: routes.settingsPreferences, label: "Study" },
      { href: routes.settingsNotifications, label: "Notifications" },
    ],
  },
] as const;

/** Settings sections (UI phase §34): a scrolling tab row on phones, a grouped list beside the content on larger screens. */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
      <div className="flex gap-1 border-b border-border px-1 sm:flex-col sm:gap-4 sm:border-b-0 sm:border-r sm:pr-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex gap-1 sm:flex-col">
            <p className="hidden px-3 pb-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground sm:block">{group.label}</p>
            <ul className="flex gap-1 sm:flex-col">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        "border-b-2 border-transparent sm:border-b-0",
                        active ? "border-primary text-foreground sm:bg-muted" : "text-muted-foreground hover:text-foreground sm:hover:bg-muted/60",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

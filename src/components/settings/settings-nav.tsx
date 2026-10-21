"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: routes.settingsProfile, label: "Profile" },
  { href: routes.settingsAppearance, label: "Appearance" },
  { href: routes.settingsPreferences, label: "Study preferences" },
  { href: routes.settingsDashboard, label: "Dashboard" },
  { href: routes.settingsTools, label: "RevTaw tools" },
  { href: routes.settingsAccount, label: "Account" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 border-b border-border px-1 sm:flex-col sm:border-b-0 sm:border-r sm:pr-4">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "border-b-2 border-transparent sm:border-b-0",
                  active
                    ? "border-primary text-foreground sm:bg-muted"
                    : "text-muted-foreground hover:text-foreground sm:hover:bg-muted/60",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import {
  BookOpenCheck,
  CalendarDays,
  FolderOpen,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MessageSquare,
  NotebookPen,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { routes } from "@/lib/routes";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Primary navigation (RevTaw spec §39). Order matters: it is the sidebar order. */
export const PRIMARY_NAV: ReadonlyArray<NavItem> = [
  { href: routes.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { href: routes.materials, label: "Materials", icon: FolderOpen },
  { href: routes.study, label: "Study", icon: BookOpenCheck },
  { href: routes.methods, label: "Study Methods", icon: Lightbulb },
  { href: routes.quiz, label: "Quiz", icon: ListChecks },
  { href: routes.flashcards, label: "Flashcards", icon: Layers },
  { href: routes.tutor, label: "AI Tutor", icon: MessageSquare },
  { href: routes.notes, label: "Notes", icon: NotebookPen },
  { href: routes.progress, label: "Progress", icon: TrendingUp },
  { href: routes.planner, label: "Planner", icon: CalendarDays },
];

export const SECONDARY_NAV: ReadonlyArray<NavItem> = [
  { href: routes.settings, label: "Settings", icon: Settings },
];

/** The four destinations that fit a mobile bottom bar (plus a "Menu" tab). */
export const MOBILE_TABS: ReadonlyArray<NavItem> = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[2],
  PRIMARY_NAV[8],
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

import {
  Award,
  BookOpenCheck,
  Brain,
  CalendarDays,
  FolderOpen,
  House,
  Layers,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Network,
  NotebookPen,
  ScrollText,
  Settings,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { TOOL_IDS, type ToolId } from "@/lib/preferences/options";
import { routes } from "@/lib/routes";

/**
 * Navigation (UI phase §9, §12): Home, then the student's pinned tools in
 * three groups — Main, Create, Learn — and everything else under More Tools.
 * Client-safe; icons are resolved in client components.
 */

export type NavGroup = "main" | "create" | "learn";

export type NavItem = {
  id: ToolId | "home" | "settings";
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line for More Tools, the tools settings page and the command menu. */
  description: string;
  group: NavGroup;
};

export const HOME_ITEM: NavItem = { id: "home", href: routes.dashboard, label: "Home", icon: House, description: "Continue studying, today's reviews and your numbers.", group: "main" };
export const SETTINGS_ITEM: NavItem = { id: "settings", href: routes.settings, label: "Settings", icon: Settings, description: "Profile, appearance, tools, AI and notifications.", group: "main" };

export const TOOLS: Record<ToolId, NavItem> = {
  study: { id: "study", href: routes.study, label: "Study", icon: BookOpenCheck, description: "Start a session with any study method.", group: "main" },
  materials: { id: "materials", href: routes.materials, label: "Materials", icon: FolderOpen, description: "Your files and notes, by subject and folder.", group: "main" },
  planner: { id: "planner", href: routes.planner, label: "Planner", icon: CalendarDays, description: "Exams, study plans, tasks and goals.", group: "main" },
  quiz: { id: "quiz", href: routes.quiz, label: "Quiz", icon: ListChecks, description: "Generate quizzes and practice tests.", group: "create" },
  flashcards: { id: "flashcards", href: routes.flashcards, label: "Flashcards", icon: Layers, description: "Decks with spaced repetition.", group: "create" },
  reviewer: { id: "reviewer", href: routes.notesNew, label: "Reviewer", icon: ScrollText, description: "Turn a material into a reviewer, summary or cheat sheet.", group: "create" },
  notes: { id: "notes", href: routes.notes, label: "Notes", icon: NotebookPen, description: "Your reviewers and saved notes.", group: "create" },
  methods: { id: "methods", href: routes.methods, label: "Study Methods", icon: Lightbulb, description: "Every method, what it is for and when to use it.", group: "learn" },
  progress: { id: "progress", href: routes.progress, label: "Progress", icon: TrendingUp, description: "Mastery, analytics and weak topics.", group: "learn" },
  tutor: { id: "tutor", href: routes.tutor, label: "AI Tutor", icon: MessageSquare, description: "Long conversations about a material, in tutor modes.", group: "learn" },
  mistakes: { id: "mistakes", href: routes.mistakes, label: "Mistake Notebook", icon: TriangleAlert, description: "Every wrong answer, waiting for a retest.", group: "learn" },
  memory: { id: "memory", href: routes.memoryAids, label: "Memory Aids", icon: Brain, description: "Mnemonics, memory palaces and stories.", group: "learn" },
  map: { id: "map", href: routes.studyMap, label: "Study Map", icon: Network, description: "How your concepts connect, colored by mastery.", group: "learn" },
  achievements: { id: "achievements", href: routes.achievements, label: "Badges", icon: Award, description: "Levels, XP and badges.", group: "learn" },
};

export const NAV_GROUPS: ReadonlyArray<{ id: NavGroup; label: string }> = [
  { id: "main", label: "Main" },
  { id: "create", label: "Create" },
  { id: "learn", label: "Learn" },
];

export type NavLayout = {
  groups: Array<{ id: NavGroup; label: string; items: NavItem[] }>;
  /** Tools that are not pinned: shown under More Tools. */
  more: NavItem[];
};

/** Pinned tools in their groups (Home first), the rest under More Tools. */
export function navLayout(pinned: readonly ToolId[]): NavLayout {
  const shown = new Set(pinned);
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: [...(group.id === "main" ? [HOME_ITEM] : []), ...TOOL_IDS.filter((id) => shown.has(id) && TOOLS[id].group === group.id).map((id) => TOOLS[id])],
  })).filter((group) => group.items.length > 0);
  const more = TOOL_IDS.filter((id) => !shown.has(id)).map((id) => TOOLS[id]);
  return { groups, more };
}

/** Bottom bar on phones: Home plus the first three pinned tools (Main first). The fifth tab is Menu. */
export function mobileTabs(pinned: readonly ToolId[]): NavItem[] {
  const { groups } = navLayout(pinned);
  return groups.flatMap((group) => group.items).slice(0, 4);
}

export function isActivePath(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The one item to highlight: the longest href that contains the current path,
 * so /quiz/mistakes lights up Mistake Notebook when it is in the list, and
 * Quiz when it is not.
 */
export function activeHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (isActivePath(pathname, item.href) && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

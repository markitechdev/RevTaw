import {
  CalendarPlus,
  FileUp,
  Layers,
  ListChecks,
  Monitor,
  Moon,
  NotebookPen,
  Play,
  RotateCcw,
  ScrollText,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { HOME_ITEM, SETTINGS_ITEM, TOOLS } from "@/components/app/nav-items";
import { TOOL_IDS } from "@/lib/preferences/schema";
import { routes } from "@/lib/routes";
import { BUILDER_METHOD_IDS, methodName } from "@/lib/study/catalog";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";

/**
 * What the command menu (UI phase §13) can do without a search: actions, every
 * tool (pinned or not), study methods, settings and the theme. Client-safe.
 */

export type CommandAction = "theme-light" | "theme-dark" | "theme-system" | "ask";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  /** Extra words that should find this command. */
  keywords?: string;
  icon: LucideIcon;
  href?: string;
  action?: CommandAction;
};

export type CommandSection = {
  id: string;
  label: string;
  commands: Command[];
  /** Shown before anything is typed. */
  initial: boolean;
  /** How many matches to show while typing. */
  limit: number;
};

const ACTIONS: Command[] = [
  { id: "ask", label: "Ask Tamari", hint: "Your study companion: questions about what you are studying", keywords: "ai tutor help explain chat question revtaw assistant tamari", icon: Sparkles, action: "ask" },
  { id: "smart-study", label: "Start Tamari's Study Plan", hint: "A session Tamari builds from what needs work", keywords: "smart study session plan recommend tamari bitaw", icon: Play, href: `${routes.study}?method=smart_study` },
  { id: "create-quiz", label: "Create a quiz", hint: "From one of your materials", keywords: "new test practice questions exam", icon: ListChecks, href: `${routes.quiz}?create=1` },
  { id: "upload", label: "Upload material", hint: "PDF, Word, a photo or notes", keywords: "add file document pdf docx image notes import", icon: FileUp, href: `${routes.materials}?upload=1` },
  { id: "flashcards-review", label: "Start flashcards", hint: "Review the cards that are due", keywords: "review spaced repetition cards due leitner", icon: Layers, href: `${routes.flashcards}/review` },
  { id: "create-deck", label: "Create flashcards", hint: "Generate a deck from a material", keywords: "new deck cards", icon: Layers, href: `${routes.flashcards}?create=1` },
  { id: "create-reviewer", label: "Create a reviewer", hint: "Summary, Cornell notes, cheat sheet…", keywords: "new notes summary cheat sheet cornell", icon: ScrollText, href: routes.notesNew },
  { id: "open-planner", label: "Open planner", hint: "Exams, plans, tasks and goals", keywords: "calendar schedule tasks", icon: CalendarPlus, href: routes.planner },
  { id: "add-exam", label: "Add an exam", hint: "RevTaw paces your reviews toward it", keywords: "new exam test date plan", icon: CalendarPlus, href: `${routes.planner}?exam=new` },
  { id: "retest", label: "Retest my mistakes", hint: "Error review from the mistake notebook", keywords: "mistakes wrong answers error review", icon: RotateCcw, href: `${routes.study}?method=error_review` },
  { id: "notes", label: "Open my notes", hint: "Reviewers and saved notes", keywords: "reviewers", icon: NotebookPen, href: routes.notes },
];

const GO_TO: Command[] = [HOME_ITEM, ...TOOL_IDS.map((id) => TOOLS[id])].map((item) => ({
  id: `go-${item.id}`,
  label: item.label,
  hint: item.description,
  keywords: item.id === "home" ? "dashboard" : undefined,
  icon: item.icon,
  href: item.href,
}));

const METHODS: Command[] = BUILDER_METHOD_IDS.map((id) => ({
  id: `method-${id}`,
  label: methodName(id),
  hint: (STUDY_METHOD_BY_ID as Record<string, { summary: string } | undefined>)[id]?.summary ?? "Study method",
  keywords: "study method session technique",
  icon: Play,
  href: `${routes.study}?method=${id}`,
}));

const SETTINGS: Command[] = [
  { id: "settings-profile", label: "Profile settings", keywords: "name", href: routes.settingsProfile },
  { id: "settings-study", label: "Study preferences", keywords: "level goal session length minutes methods time zone", href: routes.settingsPreferences },
  { id: "settings-dashboard", label: "Customize dashboard", keywords: "widgets home layout", href: routes.settingsDashboard },
  { id: "settings-tools", label: "Customize RevTaw tools", keywords: "navigation sidebar pin more tools", href: routes.settingsTools },
  { id: "settings-account", label: "Account settings", keywords: "password delete sign out", href: routes.settingsAccount },
].map((item) => ({ ...item, icon: SETTINGS_ITEM.icon, hint: "Settings" }));

const THEME: Command[] = [
  { id: "theme-light", label: "Use light theme", keywords: "appearance mode bright", icon: Sun, action: "theme-light" },
  { id: "theme-dark", label: "Use dark theme", keywords: "appearance mode night", icon: Moon, action: "theme-dark" },
  { id: "theme-system", label: "Match my device theme", keywords: "appearance mode system auto", icon: Monitor, action: "theme-system" },
];

export const COMMAND_SECTIONS: CommandSection[] = [
  { id: "actions", label: "Actions", commands: ACTIONS, initial: true, limit: 6 },
  { id: "go", label: "Go to", commands: GO_TO, initial: true, limit: 6 },
  { id: "methods", label: "Study methods", commands: METHODS, initial: false, limit: 5 },
  { id: "settings", label: "Settings", commands: SETTINGS, initial: false, limit: 4 },
  { id: "theme", label: "Theme", commands: THEME, initial: false, limit: 3 },
];

/** Opens the command menu from anywhere (buttons, the assistant, shortcuts). */
export const COMMAND_MENU_EVENT = "revtaw:command-menu";

export function openCommandMenu(): void {
  window.dispatchEvent(new Event(COMMAND_MENU_EVENT));
}

"use client";

import { CalendarDays, CornerDownLeft, FileText, GraduationCap, Layers, ListChecks, Loader2, MessageSquare, NotebookPen, Search, Target, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { COMMAND_MENU_EVENT, commandMenuShortcut, useModifierLabel } from "@/components/app/command-menu-launcher";
import { COMMAND_SECTIONS, type CommandAction } from "@/components/app/commands";
import { openAssistant } from "@/components/assistant/assistant-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { Kbd } from "@/components/ui/kbd";
import { matchRange, matchScore } from "@/lib/commands/match";
import { routes } from "@/lib/routes";
import type { QuickResult, QuickResultType } from "@/lib/search/quick";
import { cn } from "@/lib/utils";

type Option = { key: string; label: string; hint?: string | null; icon: LucideIcon; href?: string; action?: CommandAction };
type Group = { id: string; label: string; options: Option[] };

const RESULT_GROUPS: ReadonlyArray<{ label: string; types: QuickResultType[] }> = [
  { label: "Materials", types: ["material"] },
  { label: "Topics", types: ["topic"] },
  { label: "Notes", types: ["note"] },
  { label: "Planner", types: ["exam", "task"] },
  { label: "Quizzes", types: ["quiz"] },
  { label: "Flashcards", types: ["deck"] },
  { label: "Conversations", types: ["conversation"] },
];

const RESULT_ICON: Record<QuickResultType, LucideIcon> = {
  material: FileText,
  topic: Target,
  note: NotebookPen,
  task: CalendarDays,
  exam: GraduationCap,
  quiz: ListChecks,
  deck: Layers,
  conversation: MessageSquare,
};

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const range = matchRange(text, query);
  if (!range) return text;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="rounded-[3px] bg-highlight text-highlight-foreground">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

/**
 * Ctrl/Cmd+K command menu (UI phase §13): jump to any tool (pinned or not),
 * run an action (create a quiz, upload a material, start flashcards, Smart
 * Study, ask RevTaw…), or find materials, topics, notes, planner items,
 * quizzes, decks and conversations as you type. Also opens with "/" and from
 * the search buttons. A combobox over a listbox, so the keyboard and screen
 * readers move through results without leaving the input.
 *
 * Loaded by CommandMenuLauncher (command-menu-launcher.tsx), which answers the
 * shortcuts until `onReady` says the menu listens for itself; `openRequested`
 * opens it once, for a request made while it was loading.
 */
export function CommandMenu({ openRequested = false, onReady }: { openRequested?: boolean; onReady?: () => void }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const modifier = useModifierLabel();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  /** Answers already fetched while the menu is open (backspacing to an earlier query asks nothing); cleared each time it opens. */
  const answers = useRef(new Map<string, QuickResult[]>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ query: string; results: QuickResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const baseId = useId();

  const show = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    answers.current.clear();
    setQuery("");
    setRemote(null);
    setLoading(false);
    setActive(0);
    setOpen(true);
    dialog.showModal();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcut = commandMenuShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "toggle" && dialogRef.current?.open) dialogRef.current.close();
      else show();
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_MENU_EVENT, show);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_MENU_EVENT, show);
      window.clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [show]);

  // Listening now: the launcher can stop.
  useEffect(() => onReady?.(), [onReady]);

  // Asked for while this chunk was still loading.
  useEffect(() => {
    if (openRequested) show();
  }, [openRequested, show]);

  const search = (value: string) => {
    window.clearTimeout(timer.current);
    request.current?.abort();
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const known = answers.current.get(trimmed);
    if (known) {
      setRemote({ query: trimmed, results: known });
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const controller = new AbortController();
      request.current = controller;
      try {
        const response = await fetch(`/api/search/quick?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, headers: { accept: "application/json" } });
        const body = (await response.json().catch(() => ({}))) as { results?: QuickResult[] };
        if (response.ok && Array.isArray(body.results)) {
          if (answers.current.size >= 40) answers.current.delete(answers.current.keys().next().value!);
          answers.current.set(trimmed, body.results);
        }
        if (!controller.signal.aborted) setRemote({ query: trimmed, results: response.ok ? (body.results ?? []) : [] });
      } catch {
        // Aborted by the next keystroke, or offline: the commands still work.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 160);
  };

  const q = query.trim();
  const groups: Group[] = [];
  for (const section of COMMAND_SECTIONS) {
    const options = q
      ? section.commands
          .map((command) => ({ command, score: matchScore(command.label, `${command.keywords ?? ""} ${command.hint ?? ""}`, q) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, section.limit)
          .map((entry) => entry.command)
      : section.initial
        ? section.commands.slice(0, section.limit)
        : [];
    if (options.length) groups.push({ id: section.id, label: section.label, options: options.map((command) => ({ key: command.id, label: command.label, hint: command.hint, icon: command.icon, href: command.href, action: command.action })) });
  }
  if (q && remote?.query === q) {
    for (const group of RESULT_GROUPS) {
      const results = remote.results.filter((result) => group.types.includes(result.type));
      if (results.length) groups.push({ id: `results-${group.label}`, label: group.label, options: results.map((result) => ({ key: `${result.type}-${result.id}`, label: result.title, hint: result.subtitle, icon: RESULT_ICON[result.type], href: result.href })) });
    }
  }
  if (q) groups.push({ id: "search", label: "Search", options: [{ key: "search-all", label: `Search everything for “${q}”`, hint: "Documents, notes, questions, flashcards and conversations", icon: Search, href: `${routes.search}?q=${encodeURIComponent(q)}` }] });

  const flat = groups.flatMap((group) => group.options);
  const positions = new Map(flat.map((option, position) => [option.key, position]));
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const listId = `${baseId}-list`;

  const run = (option: Option) => {
    dialogRef.current?.close();
    if (option.action === "theme-light") setTheme("light");
    else if (option.action === "theme-dark") setTheme("dark");
    else if (option.action === "theme-system") setTheme("system");
    // After the menu has handed focus back, so Tamari's chat keeps it.
    else if (option.action === "ask") requestAnimationFrame(() => openAssistant());
    else if (option.href) router.push(option.href);
  };

  const move = (next: number) => {
    setActive(next);
    requestAnimationFrame(() => document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" }));
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move((activeIndex + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move((activeIndex - 1 + flat.length) % flat.length);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      move(Math.min(flat.length - 1, activeIndex + 5));
    } else if (event.key === "PageUp") {
      event.preventDefault();
      move(Math.max(0, activeIndex - 5));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      run(flat[activeIndex]);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search and commands"
      onClose={() => {
        setOpen(false);
        window.clearTimeout(timer.current);
        request.current?.abort();
        returnFocus.current?.focus?.();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-0 mx-auto mt-[8vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-black/40 open:animate-pop-in sm:mt-[12vh]"
    >
      {open && (
        <div className="flex max-h-[min(36rem,76vh)] flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-label="Search or type a command"
              placeholder="Search or type a command…"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                search(event.target.value);
              }}
              onKeyDown={onInputKeyDown}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
            <span className="sr-only" role="status" aria-live="polite">
              {q ? (loading ? "Searching…" : `${flat.length} result${flat.length === 1 ? "" : "s"}`) : ""}
            </span>
            <Kbd className="hidden sm:inline-flex">Esc</Kbd>
          </div>

          <div id={listId} role="listbox" aria-label="Results" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {groups.map((group) => (
              <div key={group.id} role="presentation" className="pb-1">
                <div id={`${baseId}-${group.id}`} aria-hidden="true" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </div>
                <div role="group" aria-labelledby={`${baseId}-${group.id}`}>
                  {group.options.map((option) => {
                    const position = positions.get(option.key) ?? -1;
                    const selected = position === activeIndex;
                    const Icon = option.icon;
                    return (
                      <div
                        key={option.key}
                        id={optionId(position)}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => {
                          if (!selected) setActive(position);
                        }}
                        onClick={() => run(option)}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2", selected ? "bg-primary-soft" : "hover:bg-muted/60")}
                      >
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            <Highlight text={option.label} query={q} />
                          </span>
                          {option.hint && <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>}
                        </span>
                        {selected && <CornerDownLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {q && !loading && flat.length === 1 && (
              <p className="px-3 pb-3 pt-1 text-sm text-muted-foreground" role="status">
                No tool, action or item matches “{q}”. Try the full search.
              </p>
            )}
          </div>

          <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:flex" aria-hidden="true">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>{modifier}</Kbd>
              <Kbd>K</Kbd> or <Kbd>/</Kbd> from anywhere
            </span>
          </div>
        </div>
      )}
    </dialog>
  );
}

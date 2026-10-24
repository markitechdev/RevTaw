"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * What every signed-in page needs of the Ctrl/Cmd+K command menu: the
 * shortcuts, the search buttons and a small launcher. The menu itself (its
 * commands, the study method catalog and the search) is a separate chunk,
 * fetched when the browser is idle after the page has loaded, or at once when
 * the student opens it first.
 */

/** Opens the command menu from anywhere (buttons, the assistant, shortcuts). */
export const COMMAND_MENU_EVENT = "revtaw:command-menu";

export function openCommandMenu(): void {
  window.dispatchEvent(new Event(COMMAND_MENU_EVENT));
}

/** The search page's input id; the command menu leaves "/" to it while it is on screen. */
export const PAGE_SEARCH_ID = "page-search";

function isTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable));
}

/**
 * Ctrl/Cmd+K toggles the menu; "/" opens it, except while typing in a field or
 * when the search page's own box is on screen. Shared by the launcher and the
 * menu, so the keys behave the same before and after the menu has loaded.
 */
export function commandMenuShortcut(event: KeyboardEvent): "toggle" | "open" | null {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") return "toggle";
  if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTextField(event.target) && !document.getElementById(PAGE_SEARCH_ID)) return "open";
  return null;
}

const noopSubscribe = () => () => {};
/** "⌘" on Apple devices, "Ctrl" elsewhere (the server and first render say "Ctrl"). */
export function useModifierLabel(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

const CommandMenu = dynamic(() => import("@/components/app/command-menu").then((module) => module.CommandMenu), { ssr: false });

/** How long to wait for an idle moment before fetching the menu anyway (and where requestIdleCallback is missing). */
const IDLE_FALLBACK_MS = 2500;

/**
 * Stands in for the command menu until it has loaded: answers the shortcuts
 * and the search buttons by asking for it (open), and fetches it anyway once
 * the browser is idle. It stops listening when the menu reports that it
 * listens for itself, so a key pressed while the chunk downloads still counts.
 */
export function CommandMenuLauncher() {
  const [request, setRequest] = useState<"none" | "load" | "open">("none");
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!commandMenuShortcut(event)) return;
      event.preventDefault();
      setRequest("open");
    };
    const onEvent = () => setRequest("open");
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_MENU_EVENT, onEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_MENU_EVENT, onEvent);
    };
  }, [ready]);

  useEffect(() => {
    if (request !== "none") return;
    const load = () => setRequest((current) => (current === "none" ? "load" : current));
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(load, { timeout: IDLE_FALLBACK_MS });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(load, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [request]);

  return request === "none" ? null : <CommandMenu openRequested={request === "open"} onReady={markReady} />;
}

/** The search field in the sidebar: a button that opens the command menu. */
export function CommandMenuTrigger({ className }: { className?: string }) {
  const modifier = useModifierLabel();
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K /"
      className={cn("flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground", className)}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate text-left">Search or jump to…</span>
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
        <Kbd>{modifier}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

/** The phone top bar's search button. */
export function CommandMenuIconButton() {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-haspopup="dialog"
      aria-label="Search and commands"
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

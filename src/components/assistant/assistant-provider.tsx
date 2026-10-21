"use client";

import { MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { TamariPeek } from "@/components/tamari/tamari-peek";
import { TamariSpeech } from "@/components/tamari/tamari-speech";
import { useTamariMove } from "@/components/tamari/use-tamari-move";
import type { PageContextRef } from "@/lib/assistant/context-schema";
import type { AiPreferences, AssistantPreferences } from "@/lib/preferences/schema";
import { napBubble, tamariLanguage, type TamariBubble, type TamariLanguage } from "@/lib/tamari/lines";
import type { TamariReaction, TamariState } from "@/lib/tamari/states";
import type { TutorActionId } from "@/lib/tutor/types";

/** Opens Tamari's chat from anywhere: the command menu, "Ask why" buttons, highlight-and-ask. */
export const ASSISTANT_EVENT = "revtaw:assistant";

export type AssistantRequest = {
  /** Text for the composer, or the message itself with `send`. */
  prompt?: string;
  action?: TutorActionId;
  /** Highlighted text the question is about. */
  selection?: string;
  /** Ground the answer in this material; a chat about another material is kept and a new one starts. */
  materialId?: string | null;
  /** Continue the student's latest chat on `materialId` instead of starting one (highlights build one thread per material). */
  continueThread?: boolean;
  /** Send at once instead of filling the composer. */
  send?: boolean;
};

export function openAssistant(request: AssistantRequest = {}): void {
  window.dispatchEvent(new CustomEvent<AssistantRequest>(ASSISTANT_EVENT, { detail: request }));
}

/** How the floating button behaves on a page: everywhere, desktop only (pages with bottom actions on phones), or not at all (a quiz in progress, the AI Tutor itself). */
export type LauncherMode = "visible" | "desktop" | "hidden";
/** What the current page told Tamari. `ref` is null on pages that only change the floating button. */
export type RegisteredPage = { ref: PageContextRef | null; label: string; materialId: string | null; launcher: LauncherMode; suggestions: string[] };

type AssistantContextValue = {
  open: boolean;
  page: RegisteredPage | null;
  ai: AiPreferences;
  /** Tamari's settings: corner button, mascot, idle animations, hints, voice, spoken answers. */
  assistant: AssistantPreferences;
  show: (request?: AssistantRequest) => void;
  hide: () => void;
  register: (entry: RegisteredPage) => () => void;
  /** The panel listens for requests here (they can arrive before it has loaded). */
  subscribe: (listener: (request: AssistantRequest) => void) => () => void;
  /** Work Tamari is doing (an answer on its way, a quiz being written) or the microphone and speech ("voice:listening", "voice:speaking"): Tamari shows it wherever it sits. */
  setActivity: (key: string, active: boolean) => void;
  /** A page offers something for Tamari to say; returns a function that takes it back (the page went away). */
  offerBubble: (bubble: TamariBubble) => () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/** Everything a picture of Tamari needs: what it is doing and saying, its settings, and a way to seat it on a page. */
export type TamariContextValue = {
  /** What Tamari is doing right now: the microphone, an answer being written, RevTaw working, a line, a nap, waiting. */
  state: TamariState;
  /** The latest one-off reaction (a right or wrong answer); `key` changes each time. */
  reaction: { kind: TamariReaction; key: number } | null;
  /** What Tamari is saying, when it is said by a seated Tamari (a nap's "Review?"). */
  bubble: TamariBubble | null;
  language: TamariLanguage;
  /** Settings → Tamari: show Tamari, pixel animations, study suggestions. */
  visible: boolean;
  animate: boolean;
  suggestions: boolean;
  /** Contextual reactions (Settings → Tamari): off keeps Tamari calm — no poses from lines, answer reactions or naps. */
  reactions: boolean;
  /** Seats Tamari on this page (Home, a plan). While a seat is mounted the edge-of-screen Tamari steps aside and Tamari's lines show there. */
  seat: () => () => void;
  react: (kind: TamariReaction) => void;
  dismissBubble: () => void;
  /** Runs the shown line's action; resolves to an error message, or null. */
  runBubbleAction: () => Promise<string | null>;
  openChat: () => void;
};

const TamariContext = createContext<TamariContextValue | null>(null);

// The panel (chat, history, voice) is loaded on first open, so pages do not pay for it up front.
const AssistantPanel = dynamic(() => import("@/components/assistant/assistant-panel"), {
  ssr: false,
  loading: () => (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 flex h-40 items-center justify-center gap-3 rounded-t-2xl border border-border bg-card text-sm text-muted-foreground shadow-pop lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[26rem] lg:rounded-2xl">
      <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
      Opening the chat…
    </div>
  ),
});

/** Tamari's speech bubbles: each at most once per browser session, three at most (sessionStorage; blocked storage = no limit memory, still once per page view). */
const HINTS_KEY = "revtaw-tamari-hints";
const MAX_HINTS = 3;
const HINT_DELAY_MS = 1200;
const HINT_VISIBLE_MS = 12_000;
/** Tamari dozes off after this long without the student touching the page, and wakes on the next input. */
const NAP_AFTER_MS = 5 * 60_000;

function shownHints(): string[] {
  try {
    const list: unknown = JSON.parse(window.sessionStorage.getItem(HINTS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberHint(id: string): void {
  try {
    window.sessionStorage.setItem(HINTS_KEY, JSON.stringify([...shownHints(), id].slice(-20)));
  } catch {
    // Storage blocked: the bubble still shows, it just may show again after a reload.
  }
}

function focusable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element !== document.body && (typeof element.checkVisibility !== "function" || element.checkVisibility());
}

/**
 * Tamari, the study companion (UI phase §16–§19, mascot doc): one assistant
 * for the whole app, with Tamari as its face. It lives in the signed-in
 * layout, so the conversation survives navigation; pages tell it what the
 * student is looking at with <AssistantPage> and what it could say with
 * <TamariHint>. Everything about how Tamari looks right now is decided here.
 */
export function AssistantProvider({ ai, assistant, children }: { ai: AiPreferences; assistant: AssistantPreferences; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Pages register what they are about; a part of a page (a picked planner task) can stack on top and step back off.
  const [pages, setPages] = useState<readonly RegisteredPage[]>([]);
  const page = pages[pages.length - 1] ?? null;
  const listeners = useRef(new Set<(request: AssistantRequest) => void>());
  const pending = useRef<AssistantRequest | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const isOpen = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [activities, setActivities] = useState<ReadonlySet<string>>(() => new Set());
  const [offer, setOffer] = useState<TamariBubble | null>(null);
  const [bubble, setBubble] = useState<TamariBubble | null>(null);
  const [napping, setNapping] = useState(false);
  const [seats, setSeats] = useState(0);
  const [reaction, setReaction] = useState<{ kind: TamariReaction; key: number } | null>(null);
  const reactionTimer = useRef(0);

  const show = useCallback((request: AssistantRequest = {}) => {
    setBubble(null);
    if (!isOpen.current) {
      const active = document.activeElement;
      returnFocus.current = focusable(active) ? active : null;
    }
    isOpen.current = true;
    setLoaded(true);
    setOpen(true);
    if (listeners.current.size > 0) listeners.current.forEach((listener) => listener(request));
    else pending.current = request;
  }, []);

  const hide = useCallback(() => {
    isOpen.current = false;
    setOpen(false);
    // Back to where the student was (the button that opened it), or to the floating button.
    requestAnimationFrame(() => {
      const target = returnFocus.current;
      returnFocus.current = null;
      if (focusable(target)) target.focus();
      else launcherRef.current?.focus();
    });
  }, []);

  const subscribe = useCallback((listener: (request: AssistantRequest) => void) => {
    listeners.current.add(listener);
    const queued = pending.current;
    pending.current = null;
    if (queued) queueMicrotask(() => listener(queued));
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const register = useCallback((entry: RegisteredPage) => {
    setPages((list) => [...list, entry]);
    return () => setPages((list) => list.filter((item) => item !== entry));
  }, []);

  const setActivity = useCallback((key: string, active: boolean) => {
    setActivities((current) => {
      if (current.has(key) === active) return current;
      const next = new Set(current);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const offerBubble = useCallback((next: TamariBubble) => {
    setOffer(next);
    return () => {
      setOffer((current) => (current?.id === next.id ? null : current));
      setBubble((current) => (current?.id === next.id ? null : current));
    };
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => show((event as CustomEvent<AssistantRequest>).detail ?? {});
    window.addEventListener(ASSISTANT_EVENT, onRequest);
    return () => window.removeEventListener(ASSISTANT_EVENT, onRequest);
  }, [show]);

  const seat = useCallback(() => {
    setSeats((count) => count + 1);
    return () => setSeats((count) => Math.max(0, count - 1));
  }, []);

  const reactionsOn = assistant.reactions;
  const react = useCallback((kind: TamariReaction) => {
    if (!reactionsOn) return;
    window.clearTimeout(reactionTimer.current);
    setReaction({ kind, key: Date.now() });
    reactionTimer.current = window.setTimeout(() => setReaction(null), 900);
  }, [reactionsOn]);

  const ask = useCallback((prompt: string, materialId?: string | null) => show({ prompt, send: true, ...(materialId !== undefined ? { materialId } : {}) }), [show]);
  const move = useTamariMove({ ask, setActivity });

  const value = useMemo<AssistantContextValue>(
    () => ({ open, page, ai, assistant, show, hide, register, subscribe, setActivity, offerBubble }),
    [open, page, ai, assistant, show, hide, register, subscribe, setActivity, offerBubble],
  );

  // The strictest wish wins: any registered part saying "hidden" (a quiz in progress) hides Tamari's corner.
  const launcher: LauncherMode = pages.some((item) => item.launcher === "hidden") ? "hidden" : pages.some((item) => item.launcher === "desktop") ? "desktop" : "visible";
  const seated = seats > 0 && assistant.mascot;
  // Tamari peeks from the screen edge unless the page seats it; it stays while the chat is open (beside the panel on wide screens).
  const showLauncher = assistant.launcher && launcher !== "hidden" && !seated;
  // Tamari is somewhere on screen: seated on the page, or at the edge.
  const withTamari = assistant.mascot && (seated || showLauncher);
  const hintsOn = withTamari && assistant.suggestions;

  // A page's offer becomes a bubble after a short pause, unless Tamari already said it this session, has said enough, or is busy saying something else.
  useEffect(() => {
    if (!offer || !hintsOn || bubble) return;
    const seen = shownHints();
    if (seen.includes(offer.id) || seen.length >= MAX_HINTS) return;
    const timer = window.setTimeout(() => {
      rememberHint(offer.id);
      setBubble(offer);
      setOffer(null);
    }, HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [offer, hintsOn, bubble]);

  // Bubbles go away on their own.
  useEffect(() => {
    if (!bubble) return;
    const timer = window.setTimeout(() => setBubble(null), HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  // A nap after a long quiet spell; the next touch, key or scroll wakes Tamari (with a "Review tayo?" once a session).
  const napLanguage = tamariLanguage(ai.language);
  useEffect(() => {
    if (!withTamari || !assistant.reactions) return;
    let timer = 0;
    let asleep = false;
    const doze = () => {
      if (document.visibilityState !== "visible") {
        timer = window.setTimeout(doze, NAP_AFTER_MS);
        return;
      }
      asleep = true;
      setNapping(true);
    };
    const wake = () => {
      window.clearTimeout(timer);
      if (asleep) {
        asleep = false;
        setNapping(false);
        if (assistant.suggestions) setOffer(napBubble(napLanguage));
      }
      timer = window.setTimeout(doze, NAP_AFTER_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    timer = window.setTimeout(doze, NAP_AFTER_MS);
    for (const name of events) window.addEventListener(name, wake, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake, { capture: true });
    };
  }, [withTamari, assistant.reactions, assistant.suggestions, napLanguage]);

  const { run: runMove } = move;
  const runBubbleAction = useCallback(async () => {
    const action = bubble?.action;
    setBubble(null);
    return action ? runMove(action) : null;
  }, [bubble, runMove]);
  const dismissBubble = useCallback(() => setBubble(null), []);
  const openChat = useCallback(() => show(), [show]);
  // Clicking Tamari: a hop first, then the chat (companion doc §13).
  const hopTimer = useRef(0);
  const hopAndOpen = useCallback(
    (hop: boolean) => {
      window.clearTimeout(hopTimer.current);
      if (!hop) {
        show();
        return;
      }
      react("correct");
      hopTimer.current = window.setTimeout(() => show(), 180);
    },
    [react, show],
  );

  // What Tamari shows: the microphone and speech first, then an answer being written, then RevTaw working
  // through the student's things (a reviewer, a quiz, a plan), then what it is saying, a nap and waiting.
  const shownBubble = hintsOn ? bubble : null;
  const working = [...activities].some((key) => key !== "chat" && !key.startsWith("voice:"));
  const tamari: TamariState = activities.has("voice:listening")
    ? "listening"
    : activities.has("voice:speaking")
      ? "speaking"
      : activities.has("chat")
        ? "thinking"
        : working
          ? "learning"
          : shownBubble
            ? assistant.reactions
              ? shownBubble.state
              : "idle"
            : napping
              ? "sleepy"
              : "idle";

  const language = tamariLanguage(ai.language);
  const tamariValue = useMemo<TamariContextValue>(
    () => ({
      state: tamari,
      reaction,
      bubble: seated ? shownBubble : null,
      language,
      visible: assistant.mascot,
      animate: assistant.idleAnimations,
      suggestions: assistant.suggestions,
      reactions: assistant.reactions,
      seat,
      react,
      dismissBubble,
      runBubbleAction,
      openChat,
    }),
    [tamari, reaction, seated, shownBubble, language, assistant.mascot, assistant.idleAnimations, assistant.suggestions, assistant.reactions, seat, react, dismissBubble, runBubbleAction, openChat],
  );

  return (
    <AssistantContext.Provider value={value}>
      <TamariContext.Provider value={tamariValue}>
      {children}
      {(showLauncher || loaded || withTamari) && (
        <aside aria-label="Tamari">
          {showLauncher && (
            <TamariPeek
              ref={launcherRef}
              state={tamari}
              reaction={reaction}
              language={language}
              mode={launcher === "desktop" ? "desktop" : "visible"}
              mascot={assistant.mascot}
              animate={assistant.idleAnimations}
              open={open}
              bubble={shownBubble && !seated && !open ? <TamariSpeech bubble={shownBubble} onAction={() => void runBubbleAction()} onDismiss={dismissBubble} /> : null}
              onOpen={hopAndOpen}
            />
          )}
          {/* Says each bubble to screen readers once; always present so the change is announced (a polite live region, not a status landmark pages look for). */}
          {withTamari && (
            <p aria-live="polite" aria-atomic="true" className="sr-only">
              {shownBubble ? `Tamari says: ${shownBubble.text}` : ""}
            </p>
          )}
          {loaded && <AssistantPanel />}
        </aside>
      )}
      </TamariContext.Provider>
    </AssistantContext.Provider>
  );
}

/** For pictures of Tamari (Home's greeting, a plan): what Tamari is doing and saying. Null outside the signed-in app. */
export function useTamari(): TamariContextValue | null {
  return useContext(TamariContext);
}

/**
 * Reports work Tamari is doing for the student (a quiz, deck or reviewer
 * being generated), so Tamari shows it in the corner. The state itself stays
 * in the provider; components only say when they start and stop.
 */
export function useTamariActivity(key: string, active: boolean): void {
  const setActivity = useContext(AssistantContext)?.setActivity;
  useEffect(() => {
    if (!setActivity) return;
    setActivity(key, active);
    return () => setActivity(key, false);
  }, [setActivity, key, active]);
}

/**
 * Something Tamari could say on this page (a reminder of today's reviews, a
 * cheer after a quiz). The provider decides whether and when it shows.
 */
export function TamariHint({ bubble }: { bubble: TamariBubble | null }) {
  const offerBubble = useContext(AssistantContext)?.offerBubble;
  const key = bubble ? JSON.stringify(bubble) : null;
  useEffect(() => {
    if (!offerBubble || !key) return;
    return offerBubble(JSON.parse(key) as TamariBubble);
  }, [offerBubble, key]);
  return null;
}

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return context;
}

/**
 * Tells Tamari what this page is about (sent with questions as ids only;
 * the server reads the details itself), how its corner button behaves
 * here, and which questions to suggest.
 */
export function AssistantPage({
  context,
  label,
  materialId = null,
  launcher = "visible",
  suggestions = [],
}: {
  context: PageContextRef;
  label: string;
  materialId?: string | null;
  launcher?: LauncherMode;
  suggestions?: string[];
}) {
  const assistant = useContext(AssistantContext);
  const register = assistant?.register;
  const key = JSON.stringify([context, label, materialId, launcher, suggestions]);
  useEffect(() => {
    if (!register) return;
    const [ref, text, material, mode, ideas] = JSON.parse(key) as [PageContextRef, string, string | null, LauncherMode, string[]];
    return register({ ref, label: text, materialId: material, launcher: mode, suggestions: ideas });
  }, [register, key]);
  return null;
}

/** A page without context of its own that still changes the floating button (the AI Tutor, a quiz in progress). */
export function AssistantLauncher({ mode }: { mode: LauncherMode }) {
  const assistant = useContext(AssistantContext);
  const register = assistant?.register;
  useEffect(() => {
    if (!register) return;
    return register({ ref: null, label: "", materialId: null, launcher: mode, suggestions: [] });
  }, [register, mode]);
  return null;
}

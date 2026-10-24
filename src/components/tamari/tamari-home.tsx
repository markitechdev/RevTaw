"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";

import { useAssistant, useTamari } from "@/components/assistant/assistant-provider";
import { TamariPerch } from "@/components/tamari/tamari-perch";
import { useTamariMove } from "@/components/tamari/use-tamari-move";
import { formatLater, LATER_COOKIE, laterLabel, OFFER_MINUTES, offerLine, parseLater } from "@/lib/tamari/coach";
import type { TamariBubble, TamariMove } from "@/lib/tamari/lines";
import { cn } from "@/lib/utils";

const pixelButton =
  "inline-flex h-8 cursor-pointer items-center justify-center border-2 border-foreground px-2.5 text-xs font-bold whitespace-nowrap shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-70";

function rememberLater(today: string, id: string): void {
  try {
    const current = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${LATER_COOKIE}=`))
      ?.slice(LATER_COOKIE.length + 1);
    // Until the day is over (the server only honours today's entries anyway).
    document.cookie = `${LATER_COOKIE}=${formatLater(today, [...parseLater(current, today), id])}; path=/; max-age=86400; samesite=lax`;
  } catch {
    // Cookies blocked: "Later" still works until the next visit.
  }
}

/** Lines already read in this visit, so the "!" does not come back on every return to Home (in memory: a reload shows it again). */
const readLines = new Set<string>();
const readListeners = new Set<() => void>();
function markRead(id: string): void {
  readLines.add(id);
  for (const listener of readListeners) listener();
}
function onRead(listener: () => void): () => void {
  readListeners.add(listener);
  return () => readListeners.delete(listener);
}

type Props = {
  /** Home's line from the student's data, or null (nothing pressing: Tamari offers to plan). */
  line: TamariBubble | null;
  today: string;
  /** The line is still on its way. */
  pending?: boolean;
  size: number;
  lgSize?: number;
};

/**
 * Tamari on Home (companion doc §1, §11–§12): the whole character at the start
 * of a row — inside the "Continue studying" card, or before the greeting when
 * that card is hidden. Nothing is said until the student clicks Tamari; a
 * small pixel "!" by its head means a line from their data is waiting (an exam
 * tomorrow, a streak ending tonight, today's reviews…) and goes once it is
 * read. The click opens a compact speech bubble beside Tamari, in place of the
 * row's words: the line and its next step plus "Later", or with nothing
 * pressing the offer "May 20 minutes ka? Ako na bahala." (10 / 20 / 30
 * minutes), and a way into the chat. Escape, a click outside or Tamari again
 * closes it. With study suggestions off a click goes straight to the chat.
 */
export function TamariHome({ line, today, pending = false, size, lgSize }: Props) {
  const tamari = useTamari();
  const { show, setActivity } = useAssistant();
  const [open, setOpen] = useState(false);
  const [putOff, setPutOff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bubbleId = useId();
  const noteId = useId();
  const { run } = useTamariMove({ ask: (prompt, materialId) => show({ prompt, send: true, ...(materialId !== undefined ? { materialId } : {}) }), setActivity });
  // A line from the provider (back from a nap: "Uy, buhay ka pa pala. Review?") comes first, then Home's own.
  const own = line && line.id !== putOff && !pending ? line : null;
  const shown = tamari?.suggestions ? (tamari.bubble ?? own) : null;
  const read = useSyncExternalStore(
    onRead,
    () => (shown ? readLines.has(shown.id) : false),
    () => false,
  );

  // Closing the bubble: a line from the provider (back from a nap) has been said, so Home's own line comes back next time.
  const sayDone = () => {
    if (shown && tamari && shown === tamari.bubble) tamari.dismissBubble();
  };
  const closeFromOutside = useEffectEvent((focusTamari: boolean) => {
    setOpen(false);
    sayDone();
    if (focusTamari) root.current?.querySelector<HTMLButtonElement>("button[data-tamari-seat]")?.focus();
  });

  // While the bubble is open: a click outside or Escape closes it (Escape hands the focus back to Tamari).
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closeFromOutside(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFromOutside(true);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!tamari?.visible) return null;
  const lang = tamari.language;
  const wrap = "relative shrink-0";

  // Study suggestions off: no lines and no offer, so Tamari is simply the way into the chat.
  if (!tamari.suggestions) {
    return (
      <div className={wrap} data-tamari-stage="">
        <TamariPerch state="idle" size={size} lgSize={lgSize} />
      </div>
    );
  }

  const go = async (key: string, move: TamariMove, fromProvider: boolean) => {
    setError(null);
    setBusy(key);
    const message = fromProvider ? await tamari.runBubbleAction() : await run(move);
    if (message) {
      setError(message);
      setBusy(null);
    }
  };

  const later = () => {
    if (!shown) return;
    if (shown === tamari.bubble) tamari.dismissBubble();
    else {
      rememberLater(today, shown.id);
      setPutOff(shown.id);
    }
    setOpen(false);
  };

  const toggle = () => {
    setError(null);
    if (open) sayDone();
    else {
      tamari.react("correct");
      if (shown) markRead(shown.id);
    }
    setOpen(!open);
  };
  const note = shown && !open && !read;

  return (
    <div ref={root} className={wrap} data-tamari-stage="" aria-busy={pending || undefined}>
      <TamariPerch state={shown?.state ?? "idle"} size={size} lgSize={lgSize} disclosure={{ expanded: open, controls: bubbleId, onToggle: toggle }} noteId={note ? noteId : undefined} />
      {note && (
        <span id={noteId} className="sr-only">
          {shown.text}
        </span>
      )}
      {open && (
        <div
          id={bubbleId}
          data-tamari-line={shown?.id ?? "offer"}
          className="tamari-enter absolute top-0 left-full z-30 ml-3 w-[min(15rem,calc(100vw-9rem))] border-2 sm:top-1/2 sm:-translate-y-1/2 border-foreground bg-card px-3 pt-2 pb-2.5 text-foreground shadow-[3px_3px_0_0_var(--foreground)]"
        >
          {/* Two pixel blocks trailing back to Tamari. */}
          <span aria-hidden="true" className="absolute top-6 -left-[0.5625rem] block size-1.5 bg-foreground sm:top-1/2" />
          <span aria-hidden="true" className="absolute top-8 -left-[1rem] block size-1 bg-foreground sm:top-[calc(50%+0.5rem)]" />
          <p className="pr-6 text-[0.8125rem] leading-snug font-semibold">
            <span className="sr-only">Tamari says: </span>
            {shown ? shown.text : offerLine(lang)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {shown ? (
              <>
                {shown.action && (
                  <button type="button" disabled={busy !== null} onClick={() => void go("action", shown.action!, shown === tamari.bubble)} className={cn(pixelButton, "bg-primary text-primary-foreground")}>
                    {busy === "action" ? (lang === "en" ? "One sec…" : "Sandali…") : shown.action.label}
                  </button>
                )}
                <button type="button" disabled={busy !== null} onClick={later} className="inline-flex h-8 cursor-pointer items-center px-1.5 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60 pointer-coarse:h-11">
                  {laterLabel(lang)}
                </button>
              </>
            ) : (
              <div role="group" aria-label="Plan my time" className="flex flex-wrap gap-1.5">
                {OFFER_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void go(`plan-${minutes}`, { kind: "plan", minutes }, false)}
                    className={cn(pixelButton, "px-2", minutes === 20 ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}
                    aria-label={`Plan ${minutes} minutes`}
                  >
                    {busy === `plan-${minutes}` ? (lang === "en" ? "Planning…" : "Sandali…") : `${minutes} min`}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                sayDone();
                tamari.openChat();
              }}
              aria-label="Ask Tamari"
              title="Ask Tamari"
              className="absolute top-0.5 right-0.5 inline-flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

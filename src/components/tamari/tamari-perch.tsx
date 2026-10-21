"use client";

import { useEffect, useRef } from "react";

import { useTamari } from "@/components/assistant/assistant-provider";
import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { tamariStatus } from "@/lib/tamari/lines";
import type { TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/** States that come from what is happening right now (the chat, the microphone, RevTaw working, a nap) win over the page's own. */
const LIVE: ReadonlySet<TamariState> = new Set(["listening", "speaking", "thinking", "learning", "sleepy"]);

type Props = {
  state?: TamariState;
  size: number;
  lgSize?: number;
  className?: string;
  /** Instead of the chat, a click shows or hides something of the page's own (Home's speech bubble). */
  disclosure?: { expanded: boolean; controls: string; onToggle: () => void };
  /** Tamari has a line waiting (the element with this id holds it): a small pixel "!" by its head, and the line as the button's description. */
  noteId?: string;
};

/**
 * Tamari seated on the page (companion doc §1, §11–§12): the whole character,
 * part of the layout rather than floating in a circle — inside a card or
 * sitting on its edge, as the parent places it. While it is on screen the
 * edge-of-screen Tamari steps aside, so Tamari never shows twice. Clicking it:
 * a small hop, then the chat (or the page's `disclosure`). It shows what
 * Tamari is doing right now, else the page's `state`.
 */
export function TamariPerch({ state = "idle", size, lgSize, className, disclosure, noteId }: Props) {
  const tamari = useTamari();
  const opening = useRef(0);
  const seat = tamari?.seat;
  const visible = tamari?.visible ?? false;

  useEffect(() => {
    if (!seat || !visible) return;
    return seat();
  }, [seat, visible]);
  useEffect(() => () => window.clearTimeout(opening.current), []);

  if (!tamari || !visible) return null;
  // With contextual reactions off, the page's own pose (serious, exam mode, confident) gives way to calm.
  const shown: TamariState = LIVE.has(tamari.state) ? tamari.state : tamari.reactions ? state : "idle";
  const status = tamariStatus(shown, tamari.language);

  const name = disclosure ? "Tamari" : "Ask Tamari";
  return (
    <button
      type="button"
      data-tamari-seat=""
      onClick={() => {
        if (disclosure) {
          disclosure.onToggle();
          return;
        }
        tamari.react("correct");
        window.clearTimeout(opening.current);
        opening.current = window.setTimeout(tamari.openChat, 180);
      }}
      aria-haspopup={disclosure ? undefined : "dialog"}
      aria-expanded={disclosure ? disclosure.expanded : undefined}
      aria-controls={disclosure?.expanded ? disclosure.controls : undefined}
      aria-describedby={noteId}
      aria-label={shown === "idle" ? name : `${name} (${status})`}
      title={noteId ? "Tamari has something to tell you" : disclosure ? "Talk to Tamari" : "Ask Tamari"}
      className={cn("group block cursor-pointer rounded-xl outline-offset-2", className)}
    >
      <span className="relative block group-hover:-translate-y-0.5 group-active:translate-y-0">
        <TamariSprite state={shown} size={size} lgSize={lgSize} animate={tamari.animate} reaction={tamari.reaction?.kind ?? null} reactionKey={tamari.reaction?.key} />
        {noteId && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-0.5 right-0 grid size-[1.125rem] place-items-center border-2 border-foreground bg-primary text-[0.6875rem] leading-none font-black text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)]",
              tamari.animate && "tamari-note",
            )}
          >
            !
          </span>
        )}
      </span>
    </button>
  );
}

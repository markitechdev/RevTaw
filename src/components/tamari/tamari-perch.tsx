"use client";

import { useEffect, useRef } from "react";

import { useTamari } from "@/components/assistant/assistant-provider";
import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { tamariStatus } from "@/lib/tamari/lines";
import type { TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/** States that come from what is happening right now (the chat, the microphone, RevTaw working, a nap) win over the page's own. */
const LIVE: ReadonlySet<TamariState> = new Set(["listening", "speaking", "thinking", "learning", "sleepy"]);

/**
 * Tamari seated on the page (companion doc §1, §11–§12): the whole character,
 * sitting on the edge of a section of the layout rather than floating in a
 * circle. The parent places it (usually over a card's top border, so the feet
 * hang over the edge). While it is on screen the edge-of-screen Tamari steps
 * aside, so Tamari never shows twice. Clicking it: a small hop, then the chat.
 * It shows what Tamari is doing right now, else the page's `state`.
 */
export function TamariPerch({ state = "idle", size, lgSize, className }: { state?: TamariState; size: number; lgSize?: number; className?: string }) {
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
  const shown: TamariState = LIVE.has(tamari.state) ? tamari.state : state;
  const status = tamariStatus(shown, tamari.language);

  return (
    <button
      type="button"
      data-tamari-seat=""
      onClick={() => {
        tamari.react("correct");
        window.clearTimeout(opening.current);
        opening.current = window.setTimeout(tamari.openChat, 180);
      }}
      aria-haspopup="dialog"
      aria-label={shown === "idle" ? "Ask Tamari" : `Ask Tamari (${status})`}
      title="Ask Tamari"
      className={cn("group block cursor-pointer rounded-xl outline-offset-2", className)}
    >
      <span className="block group-hover:-translate-y-0.5 group-active:translate-y-0">
        <TamariSprite state={shown} size={size} lgSize={lgSize} animate={tamari.animate} reaction={tamari.reaction?.kind ?? null} reactionKey={tamari.reaction?.key} />
      </span>
    </button>
  );
}

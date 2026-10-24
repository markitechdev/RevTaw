"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { openAssistant } from "@/components/assistant/assistant-provider";
import { HIGHLIGHT_ACTIONS, type TutorActionId } from "@/lib/tutor/types";
import { cn } from "@/lib/utils";

/** Above the selection with a mouse; below it on touch screens, where the system's own menu sits above. */
type Position = { top: number; left: number; below: boolean };

/**
 * Highlight-and-ask (spec §20): select text inside the wrapped content and a
 * toolbar offers Explain, Simplify, Summarize, Example, Quiz me, Ask why,
 * Compare, Mnemonic and Visualize. Tamari answers right here, in the
 * student's latest chat on this material (one thread per material). Touch
 * selections (long press and handles) fire no mouseup, so the selection is
 * also read a moment after it stops changing.
 */
export function HighlightToolbar({ materialId, children }: { materialId: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<string>("");
  const [position, setPosition] = useState<Position | null>(null);
  // A tap on the toolbar can collapse the selection on touch screens before the button's click arrives.
  const usingToolbar = useRef(false);

  const readSelection = useCallback(() => {
    if (usingToolbar.current) return;
    const current = window.getSelection();
    const text = current?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!current || current.isCollapsed || text.length < 3 || !container.current) {
      setSelection("");
      setPosition(null);
      return;
    }
    const range = current.getRangeAt(0);
    if (!container.current.contains(range.commonAncestorContainer)) {
      setSelection("");
      setPosition(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = container.current.getBoundingClientRect();
    const below = window.matchMedia("(pointer: coarse)").matches;
    setSelection(text.slice(0, 4000));
    setPosition({ top: below ? rect.bottom - host.top + 8 : rect.top - host.top - 8, left: Math.max(0, Math.min(rect.left - host.left + rect.width / 2, host.width - 40)), below });
  }, []);

  useEffect(() => {
    let settling: number | undefined;
    const onMouseUp = () => window.setTimeout(readSelection, 0);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.key === "Escape") window.setTimeout(readSelection, 0);
    };
    // Touch: read the selection once the handles stop moving.
    const onSelectionChange = () => {
      window.clearTimeout(settling);
      settling = window.setTimeout(readSelection, 350);
    };
    const onDown = (event: PointerEvent) => {
      if (toolbar.current?.contains(event.target as Node)) return;
      if (!container.current?.contains(event.target as Node)) {
        setSelection("");
        setPosition(null);
      }
    };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(settling);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [readSelection]);

  const ask = (action: TutorActionId) => {
    if (!selection) return;
    openAssistant({ action, selection, materialId, continueThread: true, send: true });
    // The question is on its way: drop the highlight so the toolbar does not come back on mouseup.
    usingToolbar.current = false;
    window.getSelection()?.removeAllRanges();
    setSelection("");
    setPosition(null);
  };

  return (
    <div ref={container} className="relative">
      {children}
      {selection && position && (
        <div
          ref={toolbar}
          role="toolbar"
          aria-label="Ask Tamari about the selection"
          className={cn("absolute z-20 -translate-x-1/2", !position.below && "-translate-y-full")}
          style={{ top: position.top, left: position.left }}
          onPointerDown={() => {
            usingToolbar.current = true;
          }}
          onPointerLeave={() => {
            usingToolbar.current = false;
          }}
        >
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
            <span className="flex items-center gap-1 px-1.5 text-2xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Ask
            </span>
            {HIGHLIGHT_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                aria-haspopup="dialog"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => ask(action.id)}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-foreground hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:px-3"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

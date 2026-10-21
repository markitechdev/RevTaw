"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { openAssistant } from "@/components/assistant/assistant-provider";
import { HIGHLIGHT_ACTIONS, type TutorActionId } from "@/lib/tutor/types";

type Position = { top: number; left: number };

/**
 * Highlight-and-ask (spec §20): select text inside the wrapped content and a
 * toolbar offers Explain, Simplify, Summarize, Example, Quiz me, Ask why,
 * Compare, Mnemonic and Visualize. Ask RevTaw answers right here, in the
 * student's latest chat on this material (one thread per material).
 */
export function HighlightToolbar({ materialId, children }: { materialId: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<string>("");
  const [position, setPosition] = useState<Position | null>(null);

  const readSelection = useCallback(() => {
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
    setSelection(text.slice(0, 4000));
    setPosition({ top: rect.top - host.top - 8, left: Math.max(0, Math.min(rect.left - host.left + rect.width / 2, host.width - 40)) });
  }, []);

  useEffect(() => {
    const onMouseUp = () => window.setTimeout(readSelection, 0);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.key === "Escape") window.setTimeout(readSelection, 0);
    };
    const onDown = (event: MouseEvent) => {
      if (toolbar.current?.contains(event.target as Node)) return;
      if (!container.current?.contains(event.target as Node)) {
        setSelection("");
        setPosition(null);
      }
    };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onDown);
    };
  }, [readSelection]);

  const ask = (action: TutorActionId) => {
    if (!selection) return;
    openAssistant({ action, selection, materialId, continueThread: true, send: true });
    // The question is on its way: drop the highlight so the toolbar does not come back on mouseup.
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
          aria-label="Ask RevTaw about the selection"
          className="absolute z-20 -translate-x-1/2 -translate-y-full"
          style={{ top: position.top, left: position.left }}
        >
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
            <span className="flex items-center gap-1 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
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
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
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

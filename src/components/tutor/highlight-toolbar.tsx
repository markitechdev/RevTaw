"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { routes } from "@/lib/routes";
import { askFromSelectionAction } from "@/lib/tutor/actions";
import { HIGHLIGHT_ACTIONS, type TutorActionId } from "@/lib/tutor/types";

type Position = { top: number; left: number };

/**
 * Highlight-and-ask (spec §20): select text inside the wrapped content and a
 * toolbar offers Explain, Simplify, Summarize, Example, Quiz me, Ask why,
 * Compare and Mnemonic. The selection plus its surrounding passage go to the
 * tutor, which opens in a conversation on the material.
 */
export function HighlightToolbar({ materialId, children }: { materialId: string; children: ReactNode }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<string>("");
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<TutorActionId | null>(null);

  const readSelection = useCallback(() => {
    if (pending) return;
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
  }, [pending]);

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
    setBusy(action);
    setError(null);
    startTransition(async () => {
      const result = await askFromSelectionAction({ materialId, action, selection });
      if (!result.ok) {
        setError(result.message);
        setBusy(null);
        return;
      }
      router.push(`${routes.tutor}/${result.data.conversationId}`);
    });
  };

  return (
    <div ref={container} className="relative">
      {children}
      {selection && position && (
        <div
          ref={toolbar}
          role="toolbar"
          aria-label="Ask the tutor about the selection"
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
                disabled={pending}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => ask(action.id)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                {busy === action.id ? "…" : action.label}
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-1 rounded-lg bg-danger-soft px-2 py-1 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

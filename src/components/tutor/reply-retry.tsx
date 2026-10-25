"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Under a question Tamari has not answered — the AI failed, or the page was left while it was thinking. The
 * question is saved, so "Try again" answers it without retyping.
 */
export function ReplyRetry({ message, busy = false, onRetry }: { message: string | null; busy?: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft/60 px-3 py-2.5 text-sm text-foreground">
      <p>{message ?? "Tamari hasn't answered this yet."}</p>
      <Button type="button" size="sm" variant="secondary" loading={busy} onClick={onRetry}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

/** Whether a conversation ends with a saved question that has no answer yet. */
export function endsUnanswered(messages: ReadonlyArray<{ id: string; role: string }>): boolean {
  const last = messages.at(-1);
  return Boolean(last && last.role === "user" && !last.id.startsWith("pending-"));
}

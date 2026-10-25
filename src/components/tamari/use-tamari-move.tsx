"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { DuplicateSessionDialog } from "@/components/study/duplicate-session-dialog";
import { startTaskAction } from "@/lib/planner/actions";
import { startSessionAction } from "@/lib/study/actions";
import { isSessionDuplicate, type SessionDuplicate } from "@/lib/study/session-duplicate";
import type { TamariMove } from "@/lib/tamari/lines";

/**
 * What became of a move: under way (the page is changing, or the question went to the chat), or not, with
 * what to tell the student. `message` is null when the student stepped back (Cancel on the warning about an
 * unfinished session), so there is nothing to show.
 */
export type MoveResult = { ok: true } | { ok: false; message: string | null };

/**
 * Runs what one of Tamari's lines offers (companion doc §5–§6): opens a page,
 * asks Tamari in the chat, or starts the work itself — today's planner task, a
 * session of one method, or Tamari's time-boxed plan — and goes to it. While
 * the work is prepared Tamari shows it is learning (laptop, "Sandali…"),
 * through `setActivity`. When the student already has an unfinished session
 * like the one asked for, the move waits on the warning (`dialog`, which the
 * caller renders): resume it, start a new one, or cancel.
 */
export function useTamariMove({ ask, setActivity }: { ask: (prompt: string, materialId?: string | null) => void; setActivity: (key: string, active: boolean) => void }): {
  run: (move: TamariMove) => Promise<MoveResult>;
  pending: boolean;
  dialog: ReactNode;
} {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<{ move: TamariMove; found: SessionDuplicate } | null>(null);
  const answer = useRef<((result: MoveResult) => void) | null>(null);
  // The warning stays up, busy, until the page changes (resuming, or the new session's page), then closes.
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setDuplicate(null);
  }

  const busy = useCallback(
    (active: boolean) => {
      setPending(active);
      setActivity("move", active);
    },
    [setActivity],
  );

  // Stays busy until the new page takes over, so a second click cannot start it twice.
  const leave = useCallback(() => window.setTimeout(() => busy(false), 3000), [busy]);

  const start = useCallback(
    async (move: Extract<TamariMove, { kind: "task" | "session" | "plan" }>, allowDuplicate: boolean): Promise<MoveResult> => {
      busy(true);
      try {
        const result =
          move.kind === "task"
            ? await startTaskAction(move.taskId)
            : move.kind === "session"
              ? await startSessionAction({
                  method: move.method,
                  materialId: move.materialId,
                  goal: null,
                  plannedMinutes: move.minutes,
                  ...(move.focus ? { focus: move.focus } : {}),
                  ...(move.concepts?.length ? { focusConcepts: move.concepts } : {}),
                  allowDuplicate,
                })
              : await startSessionAction({ method: "smart_study", materialId: move.materialId ?? null, goal: null, plannedMinutes: move.minutes, allowDuplicate });
        if (!result.ok) {
          busy(false);
          return { ok: false, message: result.message };
        }
        if (isSessionDuplicate(result.data)) {
          busy(false);
          const found = result.data;
          // The move waits for the student's answer on the warning.
          return new Promise<MoveResult>((resolve) => {
            answer.current = resolve;
            setDuplicate({ move, found });
          });
        }
        router.push(result.data.redirect);
        leave();
        return { ok: true };
      } catch {
        busy(false);
        return { ok: false, message: "That didn't start. Check your connection and try again." };
      }
    },
    [router, busy, leave],
  );

  const run = useCallback(
    async (move: TamariMove): Promise<MoveResult> => {
      if (move.kind === "open") {
        router.push(move.href);
        return { ok: true };
      }
      if (move.kind === "ask") {
        ask(move.prompt, move.materialId);
        return { ok: true };
      }
      return start(move, false);
    },
    [router, ask, start],
  );

  const settle = (result: MoveResult) => {
    const resolve = answer.current;
    answer.current = null;
    resolve?.(result);
  };

  const dialog = (
    <DuplicateSessionDialog
      duplicate={duplicate?.found ?? null}
      starting={pending}
      onStartNew={() => {
        const move = duplicate?.move;
        if (!move || move.kind === "open" || move.kind === "ask") return;
        const resolve = answer.current;
        answer.current = null;
        // A second warning (the limit was reached meanwhile) answers this move too.
        void start(move, true).then((result) => {
          if (!result.ok && result.message) setDuplicate(null);
          resolve?.(result);
        });
      }}
      onLeave={() => {
        busy(true);
        leave();
        settle({ ok: true });
      }}
      onCancel={() => {
        setDuplicate(null);
        settle({ ok: false, message: null });
      }}
    />
  );

  return { run, pending, dialog };
}

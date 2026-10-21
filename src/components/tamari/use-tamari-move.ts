"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { startTaskAction } from "@/lib/planner/actions";
import { startSessionAction } from "@/lib/study/actions";
import type { TamariMove } from "@/lib/tamari/lines";

/**
 * Runs what one of Tamari's lines offers (companion doc §5–§6): opens a page,
 * asks Tamari in the chat, or starts the work itself — today's planner task, a
 * session of one method, or Tamari's time-boxed plan — and goes to it. While
 * the work is prepared Tamari shows it is learning (laptop, "Sandali…"),
 * through `setActivity`. Resolves to an error message, or null.
 */
export function useTamariMove({ ask, setActivity }: { ask: (prompt: string, materialId?: string | null) => void; setActivity: (key: string, active: boolean) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (move: TamariMove): Promise<string | null> => {
      if (move.kind === "open") {
        router.push(move.href);
        return null;
      }
      if (move.kind === "ask") {
        ask(move.prompt, move.materialId);
        return null;
      }
      setPending(true);
      setActivity("move", true);
      const stop = (message: string) => {
        setPending(false);
        setActivity("move", false);
        return message;
      };
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
                })
              : await startSessionAction({ method: "smart_study", materialId: move.materialId ?? null, goal: null, plannedMinutes: move.minutes });
        if (!result.ok) return stop(result.message);
        // Stays busy until the new page takes over, so a second click cannot start it twice.
        router.push(result.data.redirect);
        window.setTimeout(() => {
          setPending(false);
          setActivity("move", false);
        }, 3000);
        return null;
      } catch {
        return stop("That didn't start. Check your connection and try again.");
      }
    },
    [router, ask, setActivity],
  );

  return { run, pending };
}

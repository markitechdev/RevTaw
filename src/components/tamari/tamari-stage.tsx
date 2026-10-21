"use client";

import { useState } from "react";

import { useAssistant, useTamari } from "@/components/assistant/assistant-provider";
import { TamariPerch } from "@/components/tamari/tamari-perch";
import { useTamariMove } from "@/components/tamari/use-tamari-move";
import { formatLater, LATER_COOKIE, laterLabel, OFFER_MINUTES, offerLine, parseLater } from "@/lib/tamari/coach";
import type { TamariBubble, TamariMove } from "@/lib/tamari/lines";
import { cn } from "@/lib/utils";

const pixelButton =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 border-2 border-foreground px-3 text-sm font-bold whitespace-nowrap shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-70";

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

/**
 * Tamari on Home (companion doc §1, §11–§12): the whole character sitting on
 * the top edge of the first card, beside the greeting, with one line from the
 * student's data in a pixel speech bubble — and the next step as its button
 * ("Start Review") plus "Later". With nothing pressing (or after "Later"),
 * Tamari offers to plan the student's time: "May 20 minutes ka? Ako na
 * bahala." It is part of the page, not a popup: nothing moves in on its own
 * and nothing covers the dashboard.
 */
export function TamariStage({ line, today, pending = false }: { line: TamariBubble | null; today: string; pending?: boolean }) {
  const tamari = useTamari();
  const { show, setActivity } = useAssistant();
  const [putOff, setPutOff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { run } = useTamariMove({ ask: (prompt, materialId) => show({ prompt, send: true, ...(materialId !== undefined ? { materialId } : {}) }), setActivity });

  if (!tamari?.visible) return null;
  const lang = tamari.language;
  // A line from the provider (back from a nap: "Uy, buhay ka pa pala. Review?") comes first, then Home's own.
  const own = line && line.id !== putOff ? line : null;
  const shown = tamari.suggestions && !pending ? (tamari.bubble ?? own) : null;
  const offer = tamari.suggestions && !pending && !shown;

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
    if (shown === tamari.bubble) {
      tamari.dismissBubble();
      return;
    }
    rememberLater(today, shown.id);
    setPutOff(shown.id);
  };

  return (
    <section
      aria-label="Tamari"
      data-tamari-stage=""
      aria-busy={pending || undefined}
      className="relative z-10 flex min-h-[7rem] min-w-0 items-end pl-[6.25rem] lg:pl-[8.25rem] xl:min-h-[5.5rem]"
    >
      {/* Sits on the first card's top edge: its feet hang over the border, below the greeting row. */}
      <TamariPerch state={shown?.state ?? "idle"} size={88} lgSize={120} className="absolute -bottom-[2.125rem] left-0 lg:-bottom-[2.5rem]" />
      {(shown || offer) && (
        <div className="relative mb-1 min-w-0 flex-1 border-2 border-foreground bg-card px-3.5 py-3 text-foreground shadow-[4px_4px_0_0_var(--foreground)] sm:max-w-[26rem] xl:max-w-[30rem]" data-tamari-line={shown?.id ?? "offer"}>
          {/* Two pixel blocks trailing back to Tamari. */}
          <span aria-hidden="true" className="absolute bottom-5 -left-[0.625rem] block h-1.5 w-1.5 bg-foreground" />
          <span aria-hidden="true" className="absolute bottom-3.5 -left-[1.125rem] block h-1 w-1 bg-foreground" />
          <p className="text-sm leading-snug font-semibold sm:text-[0.9375rem]">
            <span className="sr-only">Tamari says: </span>
            {shown ? shown.text : offerLine(lang)}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {shown ? (
              <>
                {shown.action && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void go("action", shown.action!, shown === tamari.bubble)}
                    className={cn(pixelButton, "bg-primary text-primary-foreground")}
                  >
                    {busy === "action" ? (lang === "en" ? "One sec…" : "Sandali…") : shown.action.label}
                  </button>
                )}
                <button type="button" disabled={busy !== null} onClick={later} className="inline-flex h-9 cursor-pointer items-center px-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60">
                  {laterLabel(lang)}
                </button>
              </>
            ) : (
              <div role="group" aria-label="Plan my time" className="flex flex-wrap gap-2">
                {OFFER_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void go(`plan-${minutes}`, { kind: "plan", minutes }, false)}
                    className={cn(pixelButton, "h-8 px-2.5", minutes === 20 ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}
                    aria-label={`Plan ${minutes} minutes`}
                  >
                    {busy === `plan-${minutes}` ? (lang === "en" ? "Planning…" : "Sandali…") : `${minutes} min`}
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

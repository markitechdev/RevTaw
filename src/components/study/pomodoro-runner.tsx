"use client";

import { Coffee, Pause, Play, SkipForward, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { formatClock, SessionHeader } from "@/components/study/session-header";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Button, buttonClasses } from "@/components/ui/button";
import { useNow } from "@/lib/hooks/use-now";
import { routes } from "@/lib/routes";
import { completePomodoroAction, savePomodoroAction } from "@/lib/study/actions";
import type { SessionDetail } from "@/lib/study/queries";
import type { SessionSummary } from "@/lib/study/sessions";
import { cn } from "@/lib/utils";

type Phase = "idle" | "work" | "break" | "long_break" | "paused";

type TimerState = {
  phase: Phase;
  pausedPhase: "work" | "break" | "long_break" | null;
  phaseEndsAt: string | null;
  pausedRemainingSeconds: number | null;
  completedRounds: number;
  focusSeconds: number;
};

type Settings = { workMinutes: number; breakMinutes: number; longBreakMinutes: number; topic: string | null };

const ROUNDS_BEFORE_LONG_BREAK = 4;

function readSettings(state: Record<string, unknown>): Settings {
  return {
    workMinutes: Number(state.workMinutes ?? 25),
    breakMinutes: Number(state.breakMinutes ?? 5),
    longBreakMinutes: Number(state.longBreakMinutes ?? 15),
    topic: typeof state.topic === "string" ? state.topic : null,
  };
}

function readTimer(state: Record<string, unknown>): TimerState {
  return {
    phase: (["idle", "work", "break", "long_break", "paused"] as Phase[]).includes(state.phase as Phase) ? (state.phase as Phase) : "idle",
    pausedPhase: (["work", "break", "long_break"] as const).includes(state.pausedPhase as "work") ? (state.pausedPhase as "work") : null,
    phaseEndsAt: typeof state.phaseEndsAt === "string" ? state.phaseEndsAt : null,
    pausedRemainingSeconds: typeof state.pausedRemainingSeconds === "number" ? state.pausedRemainingSeconds : null,
    completedRounds: Number(state.completedRounds ?? 0),
    focusSeconds: Number(state.focusSeconds ?? 0),
  };
}

/** Advances past any phase whose end time has already passed (e.g. after a refresh). */
function settle(timer: TimerState, settings: Settings, now: number): TimerState {
  let current = timer;
  for (let guard = 0; guard < 50; guard += 1) {
    if (!current.phaseEndsAt || current.phase === "idle" || current.phase === "paused") return current;
    const endsAt = new Date(current.phaseEndsAt).getTime();
    if (endsAt > now) return current;
    if (current.phase === "work") {
      const rounds = current.completedRounds + 1;
      const long = rounds % ROUNDS_BEFORE_LONG_BREAK === 0;
      current = {
        ...current,
        phase: long ? "long_break" : "break",
        completedRounds: rounds,
        focusSeconds: current.focusSeconds + settings.workMinutes * 60,
        phaseEndsAt: new Date(endsAt + (long ? settings.longBreakMinutes : settings.breakMinutes) * 60_000).toISOString(),
      };
    } else {
      current = { ...current, phase: "work", phaseEndsAt: new Date(endsAt + settings.workMinutes * 60_000).toISOString() };
    }
  }
  return current;
}

/** Pomodoro runner: work/break cycles with a long break every four rounds; progress survives refreshes. */
export function PomodoroRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: { session: SessionDetail; methodName: string; parentSessionId?: string | null; parentLabel?: string }) {
  const router = useRouter();
  const settings = readSettings((session.state as Record<string, unknown>) ?? {});
  const [stored, setStored] = useState<TimerState>(() => readTimer((session.state as Record<string, unknown>) ?? {}));
  // null on the server and while hydrating, so the countdown renders the same markup on both sides.
  const now = useNow();
  // Phases that have ended (also after a refresh) are settled from the stored state and the clock, during render.
  const timer = now === null ? stored : settle(stored, settings, now);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const lastSaved = useRef<string>("");

  const persist = useCallback(
    (state: TimerState) => {
      const key = JSON.stringify(state);
      if (key === lastSaved.current) return;
      lastSaved.current = key;
      savePomodoroAction({ sessionId: session.id, state }).then((result) => {
        if (!result.ok) setError(result.message);
      });
    },
    [session.id],
  );

  // A settled phase change is saved once (persist ignores repeats of the same state).
  useEffect(() => {
    if (timer !== stored) persist(timer);
  }, [timer, stored, persist]);

  const update = (next: TimerState) => {
    setStored(next);
    persist(next);
  };

  const startWork = () => update({ ...timer, phase: "work", pausedPhase: null, pausedRemainingSeconds: null, phaseEndsAt: new Date(Date.now() + settings.workMinutes * 60_000).toISOString() });
  const pause = () => {
    if (timer.phase !== "work" && timer.phase !== "break" && timer.phase !== "long_break") return;
    const remaining = timer.phaseEndsAt ? Math.max(0, Math.round((new Date(timer.phaseEndsAt).getTime() - Date.now()) / 1000)) : 0;
    update({ ...timer, phase: "paused", pausedPhase: timer.phase, pausedRemainingSeconds: remaining, phaseEndsAt: null });
  };
  const resume = () => {
    if (timer.phase !== "paused" || !timer.pausedPhase) return;
    update({ ...timer, phase: timer.pausedPhase, pausedPhase: null, phaseEndsAt: new Date(Date.now() + (timer.pausedRemainingSeconds ?? 0) * 1000).toISOString(), pausedRemainingSeconds: null });
  };
  const skipBreak = () => {
    if (timer.phase !== "break" && timer.phase !== "long_break") return;
    startWork();
  };

  // Seconds of the current work phase already spent (uses the ticking clock, so it is pure during render).
  const partialWorkSeconds = (at: number) => {
    if (timer.phase === "work" && timer.phaseEndsAt) {
      return Math.max(0, settings.workMinutes * 60 - Math.round((new Date(timer.phaseEndsAt).getTime() - at) / 1000));
    }
    if (timer.phase === "paused" && timer.pausedPhase === "work") return Math.max(0, settings.workMinutes * 60 - (timer.pausedRemainingSeconds ?? 0));
    return 0;
  };

  const finish = () => {
    setEnding(true);
    const focus = timer.focusSeconds + partialWorkSeconds(Date.now());
    startTransition(async () => {
      const result = await completePomodoroAction({ sessionId: session.id, focusSeconds: Math.min(86_400, focus), completedRounds: timer.completedRounds });
      if (!result.ok) {
        setError(result.message);
        setEnding(false);
        return;
      }
      setSummary(result.data);
      router.refresh();
    });
  };

  if (summary) {
    return (
      <SessionSummaryCard
        title={`${methodName} complete`}
        summary={summary}
        extraStats={[{ label: "Rounds", value: String(timer.completedRounds) }]}
        actions={
          <>
            {parentSessionId && (
              <Link href={`${routes.study}/${parentSessionId}`} className={buttonClasses({ size: "sm" })}>
                {parentLabel}
              </Link>
            )}
            <Link href={routes.study} className={buttonClasses({ size: "sm", variant: parentSessionId ? "secondary" : "primary" })}>
              Back to Study
            </Link>
            {session.material_id && (
              <Link href={`${routes.study}?method=active_recall&material=${session.material_id}`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                Active recall on this material
              </Link>
            )}
          </>
        }
      />
    );
  }

  const activePhase = timer.phase === "paused" ? timer.pausedPhase : timer.phase;
  const phaseLabel = activePhase === "work" ? "Focus" : activePhase === "long_break" ? "Long break" : activePhase === "break" ? "Break" : "Ready";
  const phaseTotal = activePhase === "work" ? settings.workMinutes * 60 : activePhase === "long_break" ? settings.longBreakMinutes * 60 : activePhase === "break" ? settings.breakMinutes * 60 : settings.workMinutes * 60;
  // Before the clock is available (server render, hydration) a running phase shows its full length; the first tick corrects it.
  const remaining = timer.phase === "paused" ? (timer.pausedRemainingSeconds ?? 0) : timer.phaseEndsAt ? (now === null ? phaseTotal : Math.max(0, Math.round((new Date(timer.phaseEndsAt).getTime() - now) / 1000))) : settings.workMinutes * 60;
  const percent = Math.min(100, Math.round(((phaseTotal - remaining) / Math.max(1, phaseTotal)) * 100));
  const totalFocus = timer.focusSeconds + (now === null ? 0 : partialWorkSeconds(now));

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`${timer.completedRounds} round${timer.completedRounds === 1 ? "" : "s"} done`}
        onEnd={finish}
        ending={ending}
        endLabel="Finish"
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-xl border border-border bg-card p-8 text-center" aria-live="polite">
        <p className={cn("text-xs font-semibold uppercase tracking-widest", activePhase === "work" ? "text-primary" : "text-success")}>
          {phaseLabel}
          {timer.phase === "paused" ? " · paused" : ""}
        </p>
        <p className="font-mono text-6xl font-semibold tabular-nums" role="timer" aria-label={`${phaseLabel} ${formatClock(remaining)} remaining`}>
          {formatClock(remaining)}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Phase progress">
          <div className={cn("h-full rounded-full transition-all", activePhase === "work" ? "bg-primary" : "bg-success")} style={{ width: `${percent}%` }} />
        </div>
        {settings.topic && <p className="text-sm text-muted-foreground">Current topic: {settings.topic}</p>}

        <div className="flex flex-wrap justify-center gap-2">
          {timer.phase === "idle" && (
            <Button type="button" onClick={startWork}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Start focus ({settings.workMinutes} min)
            </Button>
          )}
          {(timer.phase === "work" || timer.phase === "break" || timer.phase === "long_break") && (
            <Button type="button" variant="secondary" onClick={pause}>
              <Pause className="h-4 w-4" aria-hidden="true" />
              Pause
            </Button>
          )}
          {timer.phase === "paused" && (
            <Button type="button" onClick={resume}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Resume
            </Button>
          )}
          {(timer.phase === "break" || timer.phase === "long_break") && (
            <Button type="button" variant="ghost" onClick={skipBreak}>
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip break
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={finish} loading={ending || pending}>
            {!(ending || pending) && <Square className="h-4 w-4" aria-hidden="true" />}
            Finish session
          </Button>
        </div>

        <dl className="grid w-full grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Rounds</dt>
            <dd className="font-semibold tabular-nums">{timer.completedRounds}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Focus time</dt>
            <dd className="font-semibold tabular-nums">{formatClock(totalFocus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Next</dt>
            <dd className="flex items-center justify-center gap-1 font-semibold">
              <Coffee className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {(timer.completedRounds + 1) % ROUNDS_BEFORE_LONG_BREAK === 0 ? `${settings.longBreakMinutes} min long break` : `${settings.breakMinutes} min break`}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {settings.workMinutes}/{settings.breakMinutes} preset · long break every {ROUNDS_BEFORE_LONG_BREAK} rounds · your progress is saved if you refresh.
        </p>
      </section>
    </div>
  );
}

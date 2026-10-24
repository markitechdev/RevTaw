"use client";

import { TimerIcon } from "lucide-react";
import { useEffect } from "react";

import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

/** "12:05", and "125:00" for the longest exams: minutes stay minutes, as the quiz always showed them. */
function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * The time left in a timed attempt. A component of its own, so the tick
 * every second re-renders this chip and not the whole quiz (the question,
 * its options and the navigation); untimed quizzes never subscribe to the
 * clock at all. Calls `onExpire` once the time is up (the quiz submits).
 */
export function QuizCountdown({ deadline, onExpire }: { deadline: string; onExpire: () => void }) {
  const now = useNow();
  const remaining = now === null ? null : Math.round((new Date(deadline).getTime() - now) / 1000);
  const lowTime = remaining !== null && remaining <= 60;

  useEffect(() => {
    if (remaining !== null && remaining <= 0) onExpire();
  }, [remaining, onExpire]);

  if (remaining === null) return null;
  return (
    <span
      className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm tabular-nums", lowTime ? "bg-danger-soft text-danger" : "bg-muted text-foreground")}
      role="timer"
      aria-live={lowTime ? "assertive" : "off"}
      aria-label={`Time remaining ${formatClock(remaining)}`}
    >
      <TimerIcon className="h-4 w-4" aria-hidden="true" />
      {formatClock(remaining)}
    </span>
  );
}

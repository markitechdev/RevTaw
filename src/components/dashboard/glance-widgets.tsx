import { Flame, GraduationCap, Target, Timer } from "lucide-react";

import { StatTile } from "@/components/dashboard/widget-shell";
import { getMasterySummary } from "@/lib/adaptive/engine";
import { formatXp } from "@/lib/gamification/xp";
import { getGamificationView } from "@/lib/gamification/sync";
import { formatDate, WEEKDAY_SHORT, weekdayOf } from "@/lib/planner/dates";
import { getNextExam } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { routes } from "@/lib/routes";
import { getActivityStats } from "@/lib/study/queries";
import { cn } from "@/lib/utils";

/**
 * The compact "at a glance" tiles (UI phase §6): one number each, a short
 * line, and a link to the page with the details.
 */

function minutesLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export async function ExamWidget({ planning }: { planning: Promise<unknown> }) {
  await planning;
  const [exam, clock] = await Promise.all([getNextExam(), plannerClock()]);
  if (!exam) {
    return <StatTile icon={GraduationCap} label="Next exam" value="—" caption="No exam yet. Add one and RevTaw paces your reviews toward it." href={routes.planner} />;
  }
  const value = exam.daysLeft <= 0 ? "Today" : String(exam.daysLeft);
  const unit = exam.daysLeft <= 0 ? undefined : exam.daysLeft === 1 ? "day" : "days";
  return (
    <StatTile icon={GraduationCap} label="Next exam" value={value} unit={unit} caption={<span className="line-clamp-1">{exam.title} · {formatDate(exam.exam_date, clock.today)}</span>} href={`${routes.planner}/${exam.id}`}>
      {exam.readiness !== null && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Exam readiness" aria-valuenow={exam.readiness} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full rounded-full bg-progress" style={{ width: `${exam.readiness}%` }} />
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{exam.readiness}% ready</span>
        </div>
      )}
    </StatTile>
  );
}

export async function StreakWidget({ syncs }: { syncs: Promise<unknown> }) {
  // XP and badges are awarded by the sync; read them once it has run.
  await syncs;
  const view = await getGamificationView();
  return (
    <StatTile
      icon={Flame}
      label="Study streak"
      value={view.streakDays}
      unit={view.streakDays === 1 ? "day" : "days"}
      caption={`Level ${view.level.level} · ${formatXp(view.xp)} XP${view.streakDays === 0 ? " · study today to start a streak" : ""}`}
      href={`${routes.progress}/achievements`}
    >
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Level ${view.level.level} progress`} aria-valuenow={view.level.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-warning" style={{ width: `${view.level.percent}%` }} />
      </div>
    </StatTile>
  );
}

export async function StudyTimeWidget() {
  const [activity, clock] = await Promise.all([getActivityStats(), plannerClock()]);
  // Bars use whole minutes, like the numbers next to them.
  const minutes = activity.focusByDay.map((day) => ({ ...day, minutes: Math.round(day.seconds / 60) }));
  const max = Math.max(...minutes.map((day) => day.minutes), 1);
  const summary = activity.focusByDay.map((day) => `${WEEKDAY_SHORT[weekdayOf(day.date)]} ${Math.round(day.seconds / 60)} min`).join(", ");
  return (
    <StatTile icon={Timer} label="Today's focus" value={Math.round(activity.focusSecondsToday / 60)} unit="min" caption={`${minutesLabel(activity.focusSecondsWeek)} in the last 7 days`} href={routes.progress}>
      <div className="mt-3 flex h-9 items-end gap-1" role="img" aria-label={`Focus time, last 7 days: ${summary}`}>
        {minutes.map((day) => {
          const today = day.date === clock.today;
          const height = day.minutes > 0 ? Math.max(12, Math.round((day.minutes / max) * 100)) : 0;
          return (
            <span key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${WEEKDAY_SHORT[weekdayOf(day.date)]}: ${minutesLabel(day.seconds)}`}>
              <span className={cn("block w-full rounded-t-[3px]", height === 0 ? "h-0.5 rounded-b-[3px] bg-border" : today ? "bg-primary" : "bg-primary/35")} style={height ? { height: `${height}%` } : undefined} />
            </span>
          );
        })}
      </div>
    </StatTile>
  );
}

export async function MasteryWidget() {
  const summary = await getMasterySummary();
  const tracked = summary.mastered.length + summary.strong.length + summary.developing.length + summary.learning.length + summary.weak.length;
  if (tracked === 0 || summary.averageMastery === null) {
    return <StatTile icon={Target} label="Mastery" value="—" caption="Answer a few questions and RevTaw starts tracking each concept." href={routes.progress} />;
  }
  const segments = [
    { key: "mastered", count: summary.mastered.length, label: "mastered", tone: "bg-success" },
    { key: "strong", count: summary.strong.length, label: "strong", tone: "bg-info" },
    { key: "developing", count: summary.developing.length, label: "developing", tone: "bg-developing" },
    { key: "learning", count: summary.learning.length, label: "learning", tone: "bg-warning" },
    { key: "weak", count: summary.weak.length, label: "need a foundation", tone: "bg-danger" },
  ].filter((segment) => segment.count > 0);
  const description = segments.map((segment) => `${segment.count} ${segment.label}`).join(", ");
  return (
    <StatTile icon={Target} label="Mastery" value={`${Math.round(summary.averageMastery)}%`} unit="average" caption={`${tracked} concept${tracked === 1 ? "" : "s"} · ${description}`} href={routes.progress}>
      <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Concepts: ${description}`}>
        {segments.map((segment) => (
          <span key={segment.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", segment.tone)} style={{ flexGrow: segment.count }} />
        ))}
      </div>
    </StatTile>
  );
}

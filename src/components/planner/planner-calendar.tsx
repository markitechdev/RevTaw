"use client";

import { CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { ActivityDialog, type ActivityOptions } from "@/components/planner/activity-dialog";
import { TaskItem } from "@/components/planner/task-item";
import { Button, buttonClasses } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { monthGrid, shiftMonth } from "@/lib/planner/calendar";
import { addDays, formatDate, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOf } from "@/lib/planner/dates";
import type { CalendarExam, TaskView } from "@/lib/planner/queries";
import { ACTIVITY_CATEGORIES, categoryOf } from "@/lib/planner/types";
import { formatClock } from "@/lib/planner/time";
import { routes } from "@/lib/routes";
import type { ActivityCategory } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Category colors are identity, not status: their own tokens (globals.css), never success/warning/danger. */
const CATEGORY_DOT: Record<ActivityCategory, string> = {
  study: "bg-category-study",
  review: "bg-category-review",
  assignment: "bg-category-assignment",
  project: "bg-category-project",
  exam: "bg-category-exam",
  class: "bg-category-class",
  other: "bg-muted-foreground",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

function byTime(a: TaskView, b: TaskView): number {
  if (a.starts_at && b.starts_at) return a.starts_at.localeCompare(b.starts_at);
  if (a.starts_at) return -1;
  if (b.starts_at) return 1;
  return a.position - b.position;
}

/** The day to focus after a month change made from the keyboard (kept for one navigation). */
const FOCUS_KEY = "revtaw-calendar-focus";

function takeFocusRequest(): string | null {
  try {
    const value = window.sessionStorage.getItem(FOCUS_KEY);
    window.sessionStorage.removeItem(FOCUS_KEY);
    return value;
  } catch {
    return null;
  }
}

function requestFocus(date: string): void {
  try {
    window.sessionStorage.setItem(FOCUS_KEY, date);
  } catch {
    // Without storage the new month simply opens without moving focus.
  }
}

/**
 * The planner calendar (UI phase §26): a month of plans, reviews, activities
 * and exam days. Picking an empty day opens "Add an activity" for it; a busy
 * day shows its items beside the grid, each with Start, Done and Edit. The
 * grid is one tab stop: arrow keys move between days, Page Up/Down change the
 * month, Enter opens the day.
 */
export function PlannerCalendar({ month, selected: initialSelected, today, tasks, exams, options }: { month: string; selected: string; today: string; tasks: TaskView[]; exams: CalendarExam[]; options: ActivityOptions }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);
  const [shown, setShown] = useState<ActivityCategory[]>(ACTIVITY_CATEGORIES.map((category) => category.id));
  const [dialog, setDialog] = useState<{ date: string; task: TaskView | null } | null>(null);
  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const hintId = useId();
  const panelId = useId();
  const weeks = monthGrid(month);
  const gridDates = weeks.flat();

  useEffect(() => {
    const date = takeFocusRequest();
    if (date) cells.current.get(date)?.focus();
  }, []);

  const visibleTasks = tasks.filter((task) => task.status !== "skipped" && shown.includes(categoryOf(task)));
  const byDate = new Map<string, TaskView[]>();
  for (const task of visibleTasks) byDate.set(task.scheduled_for, [...(byDate.get(task.scheduled_for) ?? []), task]);
  for (const list of byDate.values()) list.sort(byTime);
  const examsByDate = new Map<string, CalendarExam[]>();
  if (shown.includes("exam")) for (const exam of exams) examsByDate.set(exam.exam_date, [...(examsByDate.get(exam.exam_date) ?? []), exam]);

  const selectedTasks = byDate.get(selected) ?? [];
  const selectedExams = examsByDate.get(selected) ?? [];

  const rememberDate = (date: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    url.searchParams.delete("month");
    window.history.replaceState(window.history.state, "", url);
  };

  const choose = (date: string) => {
    setSelected(date);
    rememberDate(date);
    const busy = (byDate.get(date)?.length ?? 0) + (examsByDate.get(date)?.length ?? 0) > 0;
    // An empty day from today on: straight to "Add an activity" (UI phase §26).
    if (!busy && date >= today) setDialog({ date, task: null });
    else if (window.matchMedia("(max-width: 63.99rem)").matches) panelRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce" ? "auto" : "smooth" });
  };

  const moveTo = (date: string) => {
    if (cells.current.has(date)) {
      setSelected(date);
      rememberDate(date);
      cells.current.get(date)?.focus();
      return;
    }
    // Outside this grid: open that month with the day selected, and keep the keyboard on it.
    requestFocus(date);
    router.push(`${routes.planner}?date=${date}`, { scroll: false });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, date: string) => {
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekdayOf(date)),
      End: () => addDays(date, 6 - weekdayOf(date)),
      PageUp: () => {
        const target = shiftMonth(date.slice(0, 7), -1);
        return `${target}-${String(Math.min(Number(date.slice(8, 10)), 28)).padStart(2, "0")}`;
      },
      PageDown: () => {
        const target = shiftMonth(date.slice(0, 7), 1);
        return `${target}-${String(Math.min(Number(date.slice(8, 10)), 28)).padStart(2, "0")}`;
      },
    };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(date);
      return;
    }
    const next = keys[event.key];
    if (!next) return;
    event.preventDefault();
    moveTo(next());
  };

  const focusDate = gridDates.includes(selected) ? selected : gridDates.includes(today) ? today : `${month}-01`;
  const selectedLabel = `${WEEKDAY_LONG[weekdayOf(selected)]}, ${formatDate(selected, today).replace(/^\w+, /, "")}`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id={titleId} className="text-lg font-semibold">
            {monthLabel(month)}
          </h2>
        </div>
        <nav aria-label="Calendar months" className="flex items-center gap-1">
          <Link href={`${routes.planner}?month=${shiftMonth(month, -1)}`} scroll={false} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`} className={buttonClasses({ variant: "ghost", size: "icon", className: "h-9 w-9" })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href={`${routes.planner}?date=${today}`} scroll={false} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-current={month === today.slice(0, 7) ? "date" : undefined}>
            Today
          </Link>
          <Link href={`${routes.planner}?month=${shiftMonth(month, 1)}`} scroll={false} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`} className={buttonClasses({ variant: "ghost", size: "icon", className: "h-9 w-9" })}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </div>

      <ChipGroup type="multiple" size="sm" name="calendar-categories" legend="Show" value={shown} onChange={setShown} options={ACTIVITY_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <p id={hintId} className="sr-only">
            Arrow keys move between days, Page Up and Page Down change the month, Enter opens the day.
          </p>
          <table role="grid" aria-labelledby={titleId} aria-describedby={hintId} className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1">
            <thead>
              <tr>
                {WEEKDAY_SHORT.map((day, index) => (
                  <th key={day} scope="col" abbr={WEEKDAY_LONG[index]} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span aria-hidden="true" className="sm:hidden">
                      {day.slice(0, 1)}
                    </span>
                    <span className="hidden sm:inline">{day}</span>
                    <span className="sr-only sm:hidden">{WEEKDAY_LONG[index]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]}>
                  {week.map((date) => {
                    const inMonth = date.slice(0, 7) === month;
                    const items = byDate.get(date) ?? [];
                    const dayExams = examsByDate.get(date) ?? [];
                    const total = items.length + dayExams.length;
                    const previews = [...dayExams.map((exam) => ({ key: exam.id, label: `Exam: ${exam.title}`, dot: CATEGORY_DOT.exam, done: false, time: null as string | null })), ...items.map((task) => ({ key: task.id, label: task.title, dot: CATEGORY_DOT[categoryOf(task)], done: task.status === "done", time: task.starts_at }))];
                    return (
                      <td
                        key={date}
                        ref={(node) => {
                          if (node) cells.current.set(date, node);
                          else cells.current.delete(date);
                        }}
                        role="gridcell"
                        tabIndex={date === focusDate ? 0 : -1}
                        aria-selected={date === selected}
                        aria-current={date === today ? "date" : undefined}
                        data-date={date}
                        onClick={() => choose(date)}
                        onKeyDown={(event) => onKeyDown(event, date)}
                        className={cn(
                          "h-14 cursor-pointer rounded-lg border border-border bg-card p-1 align-top outline-none transition-colors sm:h-24 sm:p-1.5",
                          "hover:border-input hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
                          !inMonth && "bg-muted/30 text-muted-foreground",
                          date === selected && "border-primary bg-primary-soft hover:bg-primary-soft",
                        )}
                      >
                        <div className="flex h-full flex-col gap-1 overflow-hidden">
                          <span className="flex items-center justify-between gap-1">
                            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums", date === today ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground")}>
                              {date === today && <span className="sr-only">Today, </span>}
                              {Number(date.slice(8, 10))}
                              <span className="sr-only">{` ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`}</span>
                            </span>
                            {total > 0 && <span className="sr-only">{`, ${total} item${total === 1 ? "" : "s"}: `}</span>}
                          </span>
                          {/* Phones: a dot per item; wider screens: the first titles. */}
                          <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                            {previews.slice(0, 4).map((item) => (
                              <span key={item.key} className={cn("h-1.5 w-1.5 rounded-full", item.dot, item.done && "opacity-40")} />
                            ))}
                          </span>
                          <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                            {previews.slice(0, 3).map((item) => (
                              <span key={item.key} className={cn("flex min-w-0 items-center gap-1 text-[11px] leading-tight text-foreground", item.done && "text-muted-foreground line-through")}>
                                <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.dot)} />
                                <span className="truncate">
                                  {item.time && <span className="tabular-nums text-muted-foreground">{formatClock(item.time).replace(":00", "").replace(" ", "").toLowerCase()} </span>}
                                  {item.label}
                                </span>
                              </span>
                            ))}
                            {previews.length > 3 && <span className="text-[11px] font-medium text-muted-foreground">+{previews.length - 3} more</span>}
                          </span>
                          {/* The rest of the titles still reach screen readers on phones. */}
                          <span className="sr-only sm:hidden">{previews.map((item) => item.label).join(", ")}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section ref={panelRef} id={panelId} aria-labelledby={`${panelId}-title`} className="flex scroll-mt-20 flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${panelId}-title`} className="font-display text-base font-semibold">
              {selected === today ? `Today · ${selectedLabel}` : selectedLabel}
            </h3>
            <Button type="button" size="sm" onClick={() => setDialog({ date: selected, task: null })} aria-haspopup="dialog">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add activity
            </Button>
          </div>
          {selectedExams.map((exam) => (
            <Link key={exam.id} href={`${routes.planner}/${exam.id}`} className="flex items-center gap-2 rounded-lg border border-border border-l-4 border-l-category-exam bg-card px-3 py-2 text-sm font-medium text-foreground hover:underline">
              <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
              Exam: {exam.title}
              {exam.subject && <span className="font-normal">· {exam.subject}</span>}
            </Link>
          ))}
          {selectedTasks.length === 0 && selectedExams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{selected < today ? "Nothing was planned on this day." : "Nothing planned yet. Add a study session, an assignment, a class or anything else — with a reminder if you like."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedTasks.map((task) => (
                <TaskItem key={task.id} task={task} today={today} compact stacked onEdit={(item) => setDialog({ date: item.scheduled_for, task: item })} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <ActivityDialog open={dialog !== null} onClose={() => setDialog(null)} options={options} date={dialog?.date ?? selected} task={dialog?.task ?? null} />
    </section>
  );
}

import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Hourglass, Layers, ListChecks, NotebookPen, Play, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { StartTaskButton } from "@/components/dashboard/start-task-button";
import { formatRelativeDate } from "@/components/materials/material-card";
import { buttonClasses } from "@/components/ui/button";
import { TEXT_LINK } from "@/components/ui/text-link";
import { getRecommendations } from "@/lib/adaptive/recommend";
import { getContinueItem } from "@/lib/dashboard/queries";
import { SOURCE_LABEL } from "@/lib/materials/constants";
import { countMaterials } from "@/lib/materials/queries";
import { getDueToday } from "@/lib/planner/queries";
import { countOpenMistakes } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import { methodName } from "@/lib/study/catalog";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Continue studying                                                   */
/* ------------------------------------------------------------------ */

/**
 * The hero (UI phase §5): one clear "Continue" — a bookmark where the student
 * left off. `tamari` (Home's Tamari) leads it: Tamari, then what to continue,
 * then the buttons.
 */
export async function ContinueWidget({ tamari }: { tamari?: ReactNode }) {
  const item = await getContinueItem();

  let title: string;
  let meta: string;
  let progress: { value: number; label: string } | null = null;
  let primary: { href: string; label: string };
  let secondary: { href: string; label: string } | null = null;

  if (!item) {
    return (
      <HeroFrame
        tamari={tamari}
        eyebrow="Start here"
        title="Bring your first material."
        details={
          <p className="max-w-xl text-sm text-muted-foreground">
            A PDF, a Word file, a photo of the board or notes you paste. RevTaw turns it into reviewers, quizzes and flashcards — and this spot will always show where you left off.
          </p>
        }
        actions={
          <Link href={`${routes.materials}?upload=1`} className={buttonClasses({ size: "md", className: HERO_BUTTON })}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload material
          </Link>
        }
      />
    );
  }

  if (item.kind === "session") {
    title = item.title;
    meta = [item.methodLabel, item.material?.title, `active ${formatRelativeDate(item.lastActiveAt)}`].filter(Boolean).join(" · ");
    if (item.total > 0) {
      const value = Math.round((Math.min(item.answered, item.total) / item.total) * 100);
      progress = { value, label: `${Math.min(item.answered, item.total)} of ${item.total} done` };
    }
    primary = { href: item.href, label: "Continue" };
    secondary = item.material ? { href: `${routes.materials}/${item.material.id}`, label: "Open material" } : null;
  } else if (item.kind === "quiz") {
    title = item.title;
    meta = ["Quiz in progress", `${item.questionCount} question${item.questionCount === 1 ? "" : "s"}`, `active ${formatRelativeDate(item.lastActiveAt)}`].join(" · ");
    primary = { href: item.href, label: "Continue" };
    secondary = item.material ? { href: `${routes.materials}/${item.material.id}`, label: "Open material" } : null;
  } else {
    const material = item.material;
    title = material.title;
    meta = [material.subject?.name ?? "No subject", SOURCE_LABEL[material.source], material.last_opened_at ? `opened ${formatRelativeDate(material.last_opened_at)}` : `added ${formatRelativeDate(material.updated_at)}`].join(" · ");
    primary = { href: item.href, label: "Continue" };
    secondary = material.status === "ready" ? { href: `${routes.study}?material=${material.id}`, label: "Start a session" } : null;
  }

  return (
    <HeroFrame
      tamari={tamari}
      eyebrow="Continue studying"
      title={title}
      details={
        <>
          <p className="line-clamp-2 text-sm text-muted-foreground">{meta}</p>
          {progress && (
            <div className="mt-3 flex max-w-md items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Session progress" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={100} aria-valuetext={progress.label}>
                <div className="h-full rounded-full bg-progress" style={{ width: `${progress.value}%` }} />
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{progress.label}</span>
            </div>
          )}
        </>
      }
      actions={
        <>
          <Link href={primary.href} className={buttonClasses({ size: "md", className: HERO_BUTTON })}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {primary.label}
          </Link>
          {secondary && (
            <Link href={secondary.href} className={buttonClasses({ size: "md", variant: "secondary", className: HERO_BUTTON })}>
              {secondary.label}
            </Link>
          )}
        </>
      }
    />
  );
}

/** The hero's buttons: 44 px and sharing the card's width on phones, the large size side by side on wide cards. */
const HERO_BUTTON = "h-11 min-w-0 px-3 @2xl:h-12 @2xl:px-6 @2xl:text-base";

/** "10-Minute" stays on one line: a title never breaks right after a number's hyphen. */
function keepNumberWords(text: string): string {
  return text.replace(/(\d)-(?=\p{L})/gu, "$1‑");
}

/**
 * The hero card, laid out for phones first: Tamari beside the heading (what
 * to continue), the details (where, when, how far) across the card's full
 * width under them, then the buttons sharing a row. On a wide card it is one
 * row: Tamari, the heading over the details, and the buttons at the end.
 * While Tamari talks, its bubble takes the place of the heading and details.
 * Nothing is clipped, so the bubble can reach past the card's edge, and the
 * card sits above the cards after it.
 */
function HeroFrame({ tamari, eyebrow, title, details, actions }: { tamari?: ReactNode; eyebrow: string; title: string; details: ReactNode; actions: ReactNode }) {
  return (
    <section aria-labelledby="w-continue" className="@container relative z-10 h-full rounded-2xl border border-border bg-card">
      {/* Decoration: lined paper fading in from the right, and a bookmark ribbon. */}
      <span aria-hidden="true" className="paper-lines pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 rounded-r-2xl [mask-image:linear-gradient(to_left,black,transparent)] @2xl:block" />
      <span aria-hidden="true" className="absolute top-0 right-5 h-9 w-4.5 bg-primary [clip-path:polygon(0_0,100%_0,100%_100%,50%_76%,0_100%)] sm:right-6 sm:h-10 sm:w-5" />
      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-5 @2xl:flex-row @2xl:items-end @2xl:justify-between @2xl:gap-6 @2xl:p-6 @2xl:pr-16">
        <div data-tamari-row="" className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-y-3 has-[[data-tamari-stage]]:gap-x-4 @2xl:gap-y-1.5 @2xl:has-[[data-tamari-stage]]:gap-x-5">
          <div className="@2xl:row-span-2">{tamari}</div>
          <div data-tamari-lead="" className="min-w-0 pr-8 @2xl:pr-0">
            <HeroEyebrow>{eyebrow}</HeroEyebrow>
            <p className="mt-1.5 line-clamp-3 font-display text-xl leading-tight font-semibold text-foreground @md:text-2xl @2xl:mt-2 @2xl:line-clamp-2 @2xl:text-[1.75rem]">{keepNumberWords(title)}</p>
          </div>
          <div data-tamari-lead="" className="col-span-2 min-w-0 @2xl:col-span-1 @2xl:col-start-2">
            {details}
          </div>
        </div>
        <div className="flex gap-2 *:flex-1 @2xl:*:flex-none">{actions}</div>
      </div>
    </section>
  );
}

function HeroEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 id="w-continue" className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-primary">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* RevTaw recommendation                                               */
/* ------------------------------------------------------------------ */

/** One recommendation (§5), with its reason and two ways to act on it. */
export async function RecommendationWidget() {
  const [recommendations, materialCount] = await Promise.all([getRecommendations(1), countMaterials()]);
  // Without a material there is nothing to recommend yet (the engine's generic fallback would point nowhere).
  const top = materialCount > 0 ? recommendations[0] : undefined;

  return (
    <section aria-labelledby="w-recommendation" className="@container flex h-full flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-5">
      <h2 id="w-recommendation" className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        RevTaw recommends
      </h2>
      {top ? (
        <>
          <p className="font-display text-lg font-semibold leading-snug text-foreground">{top.title}</p>
          <p className="line-clamp-3 text-sm text-muted-foreground">{top.reason}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {top.minutes} min
            </span>
            <span>{methodName(top.method)}</span>
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Link href={top.href} className={buttonClasses({ size: "sm" })}>
              Review now
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href={top.materialId ? `${routes.study}?method=practice_testing&material=${top.materialId}` : `${routes.study}?method=practice_testing`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Practice questions
            </Link>
          </div>
          <Link href={`${routes.study}?method=smart_study`} className="self-start text-xs font-medium text-primary hover:underline">
            Or let Tamari plan a session from everything that needs work
          </Link>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-semibold leading-snug text-foreground">{materialCount === 0 ? "Recommendations start after your first material." : "Take one quick quiz first."}</p>
          <p className="text-sm text-muted-foreground">
            {materialCount === 0
              ? "Once RevTaw sees how you answer, it suggests what to review next and tells you why."
              : "A few answers are enough for RevTaw to spot what needs work and pick a method for it."}
          </p>
          <div className="mt-auto pt-1">
            <Link href={materialCount === 0 ? `${routes.materials}?upload=1` : routes.quiz} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              {materialCount === 0 ? "Upload material" : "Create a quiz"}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Due today                                                           */
/* ------------------------------------------------------------------ */

type DueRow = {
  key: string;
  icon: typeof Layers;
  title: string;
  meta?: string;
  tone?: "danger";
  done?: boolean;
  action?: { href: string; label: string } | { taskId: string; label: string };
};

/** Everything due today in one list, one action per row (§5): flashcards, reviews, planned sessions, tasks, mistakes. */
export async function DueTodayWidget({ planning }: { planning: Promise<unknown> }) {
  await planning;
  const [due, openMistakes] = await Promise.all([getDueToday(), countOpenMistakes()]);
  const rows: DueRow[] = [];

  if (due.overdueCount > 0) {
    rows.push({ key: "overdue", icon: CalendarClock, title: `${due.overdueCount} overdue task${due.overdueCount === 1 ? "" : "s"}`, meta: "From earlier days", tone: "danger", action: { href: routes.planner, label: "Plan" } });
  }
  if (due.dueCards > 0) {
    rows.push({ key: "cards", icon: Layers, title: `${due.dueCards} flashcard${due.dueCards === 1 ? "" : "s"}`, meta: `About ${Math.max(1, Math.round(due.dueCards * 0.4))} min`, action: { href: `${routes.flashcards}/review`, label: "Review" } });
  }
  // Unfinished tasks first, so finished ones never fill the widget's few rows while work is left.
  const todays = due.tasks.filter((item) => item.status !== "skipped");
  for (const task of [...todays.filter((item) => item.status !== "done"), ...todays.filter((item) => item.status === "done")]) {
    const done = task.status === "done";
    rows.push({ key: task.id, icon: done ? CheckCircle2 : BookOpen, title: task.title, meta: `${task.method === "review" ? "Scheduled review" : methodName(task.method)} · ${task.minutes} min`, done, action: done ? undefined : { taskId: task.id, label: task.session_id ? "Resume" : "Start" } });
  }
  if (due.dueConcepts.length > 0) {
    const first = due.dueConcepts[0];
    rows.push({
      key: "concepts",
      icon: Hourglass,
      title: `${due.dueConcepts.length} concept${due.dueConcepts.length === 1 ? "" : "s"} fading`,
      meta: due.dueConcepts.slice(0, 3).map((concept) => concept.name).join(", "),
      action: { href: first.materialId ? `${routes.study}?method=active_recall&material=${first.materialId}` : `${routes.study}?method=active_recall`, label: "Recall" },
    });
  }
  if (openMistakes > 0) {
    rows.push({ key: "mistakes", icon: NotebookPen, title: `${openMistakes} mistake${openMistakes === 1 ? "" : "s"} to retest`, meta: "From your mistake notebook", action: { href: `${routes.study}?method=error_review`, label: "Retest" } });
  }

  const planned = due.plannedMinutes;
  const percent = planned > 0 ? Math.round((due.doneMinutes / planned) * 100) : 0;
  const visible = rows.slice(0, 6);

  return (
    <section aria-labelledby="w-due" className="@container flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="w-due" className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Due today
        </h2>
        {planned > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {due.doneMinutes} of {planned} min
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Today's planned minutes done" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-full rounded-full bg-progress" style={{ width: `${percent}%` }} />
            </span>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-1 py-4">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
            All caught up for today.
          </p>
          <p className="text-sm text-muted-foreground">
            Nothing is due. Get ahead with a quick review, or{" "}
            <Link href={routes.planner} className={TEXT_LINK}>
              plan the week
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {visible.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key} className={cn("flex items-center gap-3 rounded-lg px-2 py-2", row.done && "opacity-70")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", row.tone === "danger" ? "bg-danger-soft text-danger" : row.done ? "bg-success-soft text-success" : "bg-muted text-foreground")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium text-foreground", row.done && "line-through decoration-muted-foreground/60")}>
                    {row.title}
                    {row.done && <span className="sr-only"> (done)</span>}
                  </span>
                  {row.meta && <span className="block truncate text-xs text-muted-foreground">{row.meta}</span>}
                </span>
                {row.action && ("taskId" in row.action ? <StartTaskButton taskId={row.action.taskId} label={row.action.label} title={row.title} /> : (
                  <Link href={row.action.href} className={buttonClasses({ size: "sm", variant: "secondary", className: "shrink-0" })} aria-label={`${row.action.label}: ${row.title}`}>
                    {row.action.label}
                  </Link>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > visible.length && (
        <Link href={routes.planner} className={cn("mt-auto self-start text-xs", TEXT_LINK)}>
          {rows.length - visible.length} more in the Planner
        </Link>
      )}
    </section>
  );
}

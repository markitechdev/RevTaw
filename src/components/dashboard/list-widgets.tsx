import { CalendarDays, FileImage, FileText, FileType, Flag, FolderOpen, Layers, NotebookPen, TrendingDown } from "lucide-react";
import Link from "next/link";

import { MasteryBar } from "@/components/adaptive/mastery-table";
import { WidgetHeading, WidgetPanel } from "@/components/dashboard/widget-shell";
import { formatRelativeDate } from "@/components/materials/material-card";
import { GoalList } from "@/components/planner/goals";
import { buttonClasses } from "@/components/ui/button";
import { TEXT_LINK } from "@/components/ui/text-link";
import { getMasterySummary } from "@/lib/adaptive/engine";
import { listDecks } from "@/lib/flashcards/queries";
import { listRecentMaterials } from "@/lib/materials/queries";
import { addDays, relativeDays, formatDate } from "@/lib/planner/dates";
import { listGoalsWithProgress } from "@/lib/planner/goals";
import { listTasks } from "@/lib/planner/queries";
import { plannerClock } from "@/lib/planner/service";
import { routes } from "@/lib/routes";
import { methodName } from "@/lib/study/catalog";
import type { MaterialSource } from "@/lib/supabase/database.types";

/** List widgets (UI phase §8): quiet panels, rows with dividers, one link to the full page. */

const SOURCE_ICON: Record<MaterialSource, typeof FileText> = { pdf: FileText, docx: FileType, doc: FileType, image: FileImage, text: NotebookPen };

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center text-sm text-muted-foreground">{children}</p>;
}

export async function RecentMaterialsWidget() {
  const materials = await listRecentMaterials(4);
  return (
    <WidgetPanel labelledBy="w-recent">
      <WidgetHeading id="w-recent" icon={FolderOpen} title="Recent materials" action={{ href: routes.materials, label: "All materials" }} />
      {materials.length === 0 ? (
        <EmptyLine>
          Nothing here yet.&nbsp;
          <Link href={`${routes.materials}?upload=1`} className={TEXT_LINK}>
            Upload your first material
          </Link>
        </EmptyLine>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-border">
          {materials.map((material) => {
            const Icon = SOURCE_ICON[material.source];
            return (
              <li key={material.id} className="flex items-center gap-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`${routes.materials}/${material.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                    {material.title}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {material.subject?.name ?? "No subject"} · {formatRelativeDate(material.last_opened_at ?? material.updated_at)}
                    {material.status === "failed" ? " · failed" : material.status !== "ready" ? " · processing" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetPanel>
  );
}

export async function WeakTopicsWidget() {
  const summary = await getMasterySummary();
  const rows = summary.needsWork.slice(0, 5);
  return (
    <WidgetPanel labelledBy="w-weak">
      <WidgetHeading id="w-weak" icon={TrendingDown} title="Weak topics" action={{ href: routes.progress, label: "Progress" }} />
      {rows.length === 0 ? (
        <EmptyLine>{summary.total === 0 ? "No data yet — one quiz or recall session is enough to see patterns." : "No weak topics right now: nothing you practiced keeps going wrong."}</EmptyLine>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <Link href={row.concept?.material_id ? `${routes.study}?method=active_recall&material=${row.concept.material_id}` : `${routes.study}?method=active_recall`} className="block truncate text-sm font-medium text-foreground hover:underline">
                  {row.concept?.name ?? "Concept"}
                </Link>
                {row.concept?.material && <span className="block truncate text-xs text-muted-foreground">{row.concept.material.title}</span>}
              </span>
              <MasteryBar value={Number(row.mastery)} status={row.status} compact />
            </li>
          ))}
        </ul>
      )}
    </WidgetPanel>
  );
}

export async function FlashcardsWidget() {
  const decks = (await listDecks()).filter((deck) => deck.status === "ready");
  const due = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const top = [...decks].sort((a, b) => b.dueCount - a.dueCount || b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  return (
    <WidgetPanel labelledBy="w-flashcards">
      <WidgetHeading id="w-flashcards" icon={Layers} title="Flashcards" action={{ href: routes.flashcards, label: "All decks" }} />
      {top.length === 0 ? (
        <EmptyLine>No decks yet. Open a material and choose Flashcards to generate one.</EmptyLine>
      ) : (
        <>
          <ul className="-my-1 flex flex-col divide-y divide-border">
            {top.map((deck) => (
              <li key={deck.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <Link href={`${routes.flashcards}/${deck.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                    {deck.title}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {deck.card_count} card{deck.card_count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className={deck.dueCount > 0 ? "shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning" : "shrink-0 text-xs text-muted-foreground"}>{deck.dueCount > 0 ? `${deck.dueCount} due` : "Up to date"}</span>
              </li>
            ))}
          </ul>
          {due > 0 && (
            <Link href={`${routes.flashcards}/review`} className={buttonClasses({ size: "sm", variant: "secondary", className: "mt-auto self-start" })}>
              Review {due} due card{due === 1 ? "" : "s"}
            </Link>
          )}
        </>
      )}
    </WidgetPanel>
  );
}

export async function GoalsWidget() {
  const goals = (await listGoalsWithProgress()).filter((goal) => goal.goal.status === "active").slice(0, 4);
  return (
    <WidgetPanel labelledBy="w-goals">
      <WidgetHeading id="w-goals" icon={Flag} title="Goals" action={{ href: routes.planner, label: "Planner" }} />
      {goals.length === 0 ? <EmptyLine>No goals yet. Set a daily focus or weekly flashcard goal in the Planner.</EmptyLine> : <GoalList goals={goals} compact />}
    </WidgetPanel>
  );
}

export async function PlannerWidget({ planning }: { planning: Promise<unknown> }) {
  await planning;
  const { today } = await plannerClock();
  const tasks = (await listTasks({ from: today, to: addDays(today, 6) })).filter((task) => task.status === "pending" || task.status === "missed");
  const days = [...new Set(tasks.map((task) => task.scheduled_for))].slice(0, 4);
  return (
    <WidgetPanel labelledBy="w-planner">
      <WidgetHeading id="w-planner" icon={CalendarDays} title="Next 7 days" action={{ href: routes.planner, label: "Open planner" }} />
      {days.length === 0 ? (
        <EmptyLine>Nothing planned this week. Add an exam or a task in the Planner.</EmptyLine>
      ) : (
        <ol className="-my-1 flex flex-col divide-y divide-border">
          {days.map((day) => {
            const items = tasks.filter((task) => task.scheduled_for === day);
            const minutes = items.reduce((sum, task) => sum + task.minutes, 0);
            return (
              <li key={day} className="flex gap-3 py-2">
                <span className="w-20 shrink-0 text-xs font-semibold text-foreground">
                  {relativeDays(day, today) === "Today" || relativeDays(day, today) === "Tomorrow" ? relativeDays(day, today) : formatDate(day, today)}
                  <span className="block font-normal text-muted-foreground">{minutes} min</span>
                </span>
                <ul className="min-w-0 flex-1 text-sm">
                  {items.slice(0, 3).map((task) => (
                    <li key={task.id} className="truncate">
                      {task.title}
                      <span className="text-xs text-muted-foreground"> · {task.method === "review" ? "Review" : methodName(task.method)}</span>
                    </li>
                  ))}
                  {items.length > 3 && <li className="text-xs text-muted-foreground">+{items.length - 3} more</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </WidgetPanel>
  );
}

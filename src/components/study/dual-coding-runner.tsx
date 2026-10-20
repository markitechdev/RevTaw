"use client";

import { ArrowDown, ArrowRight, ArrowUp, Check, Image as ImageIcon, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { RunnerDone, RunnerSummary, useSessionCompletion, VerdictBox, verdictOf, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { VisualView } from "@/components/study/visual-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { VisualCheck } from "@/lib/study/flows/visual";
import { checkVisualAction } from "@/lib/study/method-actions";
import type { SessionDetail } from "@/lib/study/queries";
import { hierarchyPairs, rebuildPrompt, seededShuffle, tableBlanks, VISUAL_TYPE_LABEL, type DualView, type Visual, type VisualAnswer, type VisualTopic } from "@/lib/study/visuals";
import { cn } from "@/lib/utils";

type Item = SessionDetail["items"][number];

const STANDARD_RELATIONS = ["causes", "requires", "leads to", "contains", "depends on", "is an example of"];

function topicOf(item: Item | undefined): VisualTopic | null {
  return (item?.analysis as { topic?: VisualTopic } | null)?.topic ?? null;
}

/** Reorder steps or events with buttons (keyboard and screen-reader friendly). */
function OrderExercise({ labels, order, onChange, marks }: { labels: string[]; order: number[]; onChange: (order: number[]) => void; marks: boolean[] | null }) {
  const move = (position: number, delta: number) => {
    const target = position + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[position], next[target]] = [next[target], next[position]];
    onChange(next);
  };
  return (
    <ol className="flex flex-col gap-2">
      {order.map((original, position) => (
        <li key={original} className={cn("flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-sm", marks && (marks[position] ? "border-success/50 bg-success-soft/40" : "border-danger/40 bg-danger-soft/40"))}>
          <span className="w-6 text-center text-muted-foreground">{position + 1}.</span>
          <span className="min-w-0 flex-1">{labels[original]}</span>
          {!marks && (
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move "${labels[original]}" up`} disabled={position === 0} onClick={() => move(position, -1)}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move "${labels[original]}" down`} disabled={position === order.length - 1} onClick={() => move(position, 1)}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          )}
          {marks && <span className="sr-only">{marks[position] ? "in the right place" : "in the wrong place"}</span>}
        </li>
      ))}
    </ol>
  );
}

/** The starting answer of a rebuild: steps and events begin shuffled (same order on every render). */
function initialAnswer(visual: Visual, seed: string): VisualAnswer | null {
  if (visual.type === "flowchart") return { kind: "order", order: seededShuffle(visual.steps.map((_, index) => index), seed) };
  if (visual.type === "timeline") return { kind: "order", order: seededShuffle(visual.events.map((_, index) => index), seed) };
  return null;
}

function Exercise({ item, visual, answer, onAnswer, marks }: { item: Item; visual: Visual; answer: VisualAnswer | null; onAnswer: (answer: VisualAnswer) => void; marks: boolean[] | null }) {
  const [cells, setCells] = useState<Record<string, string>>({});
  const [parents, setParents] = useState<Record<string, string>>({});
  const [relations, setRelations] = useState<string[]>(() => (visual.type === "relationships" ? visual.links.map(() => "") : []));

  switch (visual.type) {
    case "flowchart":
    case "timeline":
      return (
        <OrderExercise
          labels={visual.type === "flowchart" ? visual.steps.map((step) => step.label) : visual.events.map((event) => event.label)}
          order={answer?.kind === "order" ? answer.order : (initialAnswer(visual, item.id) as { order: number[] }).order}
          marks={marks}
          onChange={(order) => onAnswer({ kind: "order", order })}
        />
      );
    case "table": {
      const blanks = tableBlanks(visual);
      const isBlank = (row: number, column: number) => blanks.findIndex((blank) => blank.row === row && blank.column === column);
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                {visual.columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visual.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border align-top">
                  {row.map((cell, columnIndex) => {
                    const blank = isBlank(rowIndex, columnIndex);
                    if (blank === -1) return <td key={columnIndex} className="px-3 py-2">{cell}</td>;
                    const key = `${rowIndex},${columnIndex}`;
                    return (
                      <td key={columnIndex} className="px-2 py-1.5">
                        <Input
                          aria-label={`${visual.columns[columnIndex]} for ${row[0]}`}
                          value={cells[key] ?? ""}
                          disabled={Boolean(marks)}
                          className={cn("h-9", marks && (marks[blank] ? "border-success" : "border-danger"))}
                          onChange={(event) => {
                            const next = { ...cells, [key]: event.target.value };
                            setCells(next);
                            onAnswer({ kind: "cells", cells: Object.entries(next).map(([position, value]) => ({ row: Number(position.split(",")[0]), column: Number(position.split(",")[1]), value })) });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "hierarchy": {
      const pairs = seededShuffle(hierarchyPairs(visual), item.id);
      const options = [visual.root, ...visual.children.map((child) => child.label)];
      return (
        <ul className="flex flex-col gap-2 text-sm">
          {pairs.map((pair) => {
            const markIndex = hierarchyPairs(visual).findIndex((entry) => entry.label === pair.label);
            return (
              <li key={pair.label} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border p-2", marks && (marks[markIndex] ? "border-success/50 bg-success-soft/40" : "border-danger/40 bg-danger-soft/40"))}>
                <span className="min-w-0 flex-1 font-medium">{pair.label}</span>
                <span className="text-muted-foreground">belongs to</span>
                <Select
                  aria-label={`Parent of ${pair.label}`}
                  value={parents[pair.label] ?? ""}
                  disabled={Boolean(marks)}
                  className="w-48"
                  onChange={(event) => {
                    const next = { ...parents, [pair.label]: event.target.value };
                    setParents(next);
                    onAnswer({ kind: "parents", parents: Object.entries(next).map(([label, parent]) => ({ label, parent })) });
                  }}
                >
                  <option value="">Choose…</option>
                  {options
                    .filter((option) => option !== pair.label)
                    .map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </Select>
              </li>
            );
          })}
        </ul>
      );
    }
    case "relationships": {
      const options = [...new Set([...visual.links.map((link) => link.relation), ...STANDARD_RELATIONS])];
      return (
        <ul className="flex flex-col gap-2 text-sm">
          {visual.links.map((link, index) => (
            <li key={`${index}-${link.from}`} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border p-2", marks && (marks[index] ? "border-success/50 bg-success-soft/40" : "border-danger/40 bg-danger-soft/40"))}>
              <span className="font-medium">{link.from}</span>
              <Select
                aria-label={`Relationship from ${link.from} to ${link.to}`}
                value={relations[index] ?? ""}
                disabled={Boolean(marks)}
                className="w-44"
                onChange={(event) => {
                  const next = relations.map((value, position) => (position === index ? event.target.value : value));
                  setRelations(next);
                  onAnswer({ kind: "relations", relations: next });
                }}
              >
                <option value="">Choose…</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <span className="font-medium">{link.to}</span>
            </li>
          ))}
        </ul>
      );
    }
  }
}

/**
 * Dual coding (§16): each topic as text and as a visual, with Text / Visual /
 * Combined views, then a rebuild-from-memory exercise checked on the server.
 */
export function DualCodingRunner({ session, methodName, parentSessionId = null, parentLabel = "Back to smart session" }: RunnerProps) {
  const items = session.items;
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((entry) => !entry.answered_at);
    return first === -1 ? items.length : first;
  });
  const [view, setView] = useState<DualView>("combined");
  const [mode, setMode] = useState<"study" | "rebuild">("study");
  const [answer, setAnswer] = useState<VisualAnswer | null>(null);
  const [checks, setChecks] = useState<Record<string, VisualCheck>>(() =>
    Object.fromEntries(items.filter((entry) => entry.answered_at && (entry.analysis as { check?: VisualCheck } | null)?.check).map((entry) => [entry.id, (entry.analysis as { check: VisualCheck }).check])),
  );
  const shownAt = useRef<number>(0);
  const item = items[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [item?.id, mode]);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  const topic = topicOf(item);
  if (!item || !topic) return <RunnerDone session={session} methodName={methodName} message="Every visual is rebuilt." ending={ending} onFinish={() => finish()} />;
  const check = checks[item.id];
  const answered = Object.keys(checks).length;

  const submit = () => {
    if (!answer) return;
    setError(null);
    startTransition(async () => {
      const result = await checkVisualAction({ itemId: item.id, answer, responseMs: Math.min(86_400_000, Date.now() - shownAt.current) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChecks((state) => ({ ...state, [item.id]: result.data }));
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setMode("study");
    setAnswer(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        title={session.title}
        methodName={methodName}
        startedAt={session.started_at}
        plannedMinutes={session.planned_minutes}
        progressLabel={`topic ${index + 1} of ${items.length}`}
        onEnd={() => finish(answered === 0)}
        ending={ending}
        endLabel={answered === 0 ? "Stop" : "End & summarize"}
      />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="visual-title" className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">
              <ImageIcon className="h-3 w-3" aria-hidden="true" />
              {VISUAL_TYPE_LABEL[topic.visual.type]}
            </Badge>
            {item.concept && <Badge tone="primary">{item.concept.name}</Badge>}
          </div>
          {mode === "study" && (
            <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
              {(["text", "visual", "combined"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={view === option}
                  onClick={() => setView(option)}
                  className={cn("rounded-md px-3 py-1 capitalize", view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
        <h2 id="visual-title" className="text-lg font-medium leading-snug">
          {topic.title}
        </h2>

        {mode === "study" ? (
          <>
            <div className={cn("grid gap-4", view === "combined" && "lg:grid-cols-2")}>
              {view !== "visual" && <p className="text-[15px] leading-relaxed">{topic.text}</p>}
              {view !== "text" && <VisualView visual={topic.visual} title={topic.title} />}
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAnswer(initialAnswer(topic.visual, item.id));
                  setMode("rebuild");
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Rebuild from memory
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{rebuildPrompt(topic.visual.type)} The visual is hidden.</p>
            <Exercise key={item.id} item={item} visual={topic.visual} answer={answer} marks={check?.marks ?? null} onAnswer={setAnswer} />
            {!check ? (
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" size="sm" loading={pending} disabled={!answer} onClick={submit}>
                  {!pending && <Check className="h-4 w-4" aria-hidden="true" />}
                  Check my rebuild
                </Button>
              </div>
            ) : (
              <>
                <VerdictBox verdict={verdictOf(check.score)} score={check.score}>
                  <p className="mt-2">{check.isCorrect ? "Rebuilt from memory." : "Compare with the original below, then try it again in your head."}</p>
                </VerdictBox>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original</p>
                  <VisualView visual={topic.visual} title={topic.title} />
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button type="button" size="sm" onClick={next} loading={ending}>
                    {index + 1 >= items.length ? "Finish session" : "Next topic"}
                    {!ending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { Check, Flag, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { completeGoalAction, createGoalAction, deleteGoalAction } from "@/lib/planner/actions";
import type { GoalProgress } from "@/lib/planner/goals";
import { GOAL_KIND_BY_ID, GOAL_KINDS, GOAL_PERIOD_LABEL, type GoalFormInput } from "@/lib/planner/types";
import type { GoalKind, GoalPeriod } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type GoalMaterialOption = { id: string; title: string };

/** "Add goal" dialog (§32). */
export function NewGoalButton({ materials, today, size = "sm", variant = "secondary" }: { materials: GoalMaterialOption[]; today: string; size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GoalKind>("focus_minutes");
  const [period, setPeriod] = useState<GoalPeriod>("day");
  const [target, setTarget] = useState(60);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meta = GOAL_KIND_BY_ID[kind];

  const chooseKind = (next: GoalKind) => {
    const info = GOAL_KIND_BY_ID[next];
    setKind(next);
    setTarget(info.defaultTarget);
    if (!info.periods.includes(period)) setPeriod(info.periods[0]);
  };

  const submit = () => {
    setError(null);
    const input: GoalFormInput = { kind, period, target: Math.max(1, Math.round(target) || 1), materialId: meta.needsMaterial ? materialId || null : null, dueDate: period === "once" ? dueDate || null : null, title: title.trim() || null };
    startTransition(async () => {
      const result = await createGoalAction(input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setTitle("");
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add goal
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} dismissible={!pending} title="Add a study goal" description="Progress is measured from your sessions, reviews, answers and mastery automatically.">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <fieldset disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Goal type</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GOAL_KINDS.map((item) => (
                <label key={item.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-primary has-checked:bg-primary-soft", item.needsMaterial && materials.length === 0 && "cursor-not-allowed opacity-60")}>
                  <input type="radio" name="goal-kind" value={item.id} checked={kind === item.id} disabled={item.needsMaterial && materials.length === 0} onChange={() => chooseKind(item.id)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span className="flex flex-col">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {kind !== "finish_material" && (
              <Field id="goal-target" label={`Target${meta.unit ? ` (${meta.unit})` : ""}`} required>
                <Input {...fieldA11y("goal-target")} type="number" min={1} max={kind === "mastery" ? 100 : 100000} value={target} disabled={pending} onChange={(event) => setTarget(Number(event.target.value) || 1)} />
              </Field>
            )}
            <Field id="goal-period" label="When">
              <Select {...fieldA11y("goal-period")} value={period} disabled={pending} onChange={(event) => setPeriod(event.target.value as GoalPeriod)}>
                {meta.periods.map((item) => (
                  <option key={item} value={item}>
                    {GOAL_PERIOD_LABEL[item]}
                  </option>
                ))}
              </Select>
            </Field>
            {meta.needsMaterial && (
              <Field id="goal-material" label="Material" required>
                <Select {...fieldA11y("goal-material")} value={materialId} disabled={pending} onChange={(event) => setMaterialId(event.target.value)}>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {period === "once" && (
              <Field id="goal-due" label="Due date (optional)">
                <Input {...fieldA11y("goal-due")} type="date" min={today} value={dueDate} disabled={pending} onChange={(event) => setDueDate(event.target.value)} />
              </Field>
            )}
          </div>
          <Field id="goal-title" label="Name (optional)" hint="Leave empty for an automatic name.">
            <Input {...fieldA11y("goal-title")} value={title} maxLength={120} placeholder="e.g. Finish Chapter 4 before Friday" disabled={pending} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add goal
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Goal list with progress bars; "once" goals can be ticked off by hand. */
export function GoalList({ goals, compact = false }: { goals: GoalProgress[]; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (id: string, action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      setBusy(null);
      router.refresh();
    });
  };

  if (goals.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {error && (
        <li className="text-xs text-danger" role="alert">
          {error}
        </li>
      )}
      {goals.map((item) => (
        <li key={item.goal.id} className={cn("flex flex-col gap-1.5", item.goal.status === "completed" && "opacity-75")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Flag className={cn("h-3.5 w-3.5", item.reached ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
                <span className={cn(item.goal.status === "completed" && "line-through decoration-muted-foreground/60")}>{item.label}</span>
                {item.reached && <Badge tone="success">Reached</Badge>}
                {!compact && item.goal.period !== "once" && <Badge tone="neutral">{GOAL_PERIOD_LABEL[item.goal.period]}</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
            {!compact && (
              <div className="flex shrink-0 gap-1">
                {item.goal.period === "once" && (
                  <Button type="button" size="sm" variant="ghost" aria-label={item.goal.status === "completed" ? "Reopen goal" : "Mark goal done"} title={item.goal.status === "completed" ? "Reopen" : "Mark done"} loading={busy === `${item.goal.id}:done` && pending} disabled={pending} onClick={() => run(`${item.goal.id}:done`, () => completeGoalAction(item.goal.id, item.goal.status !== "completed"))}>
                    {!(busy === `${item.goal.id}:done` && pending) && (item.goal.status === "completed" ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />)}
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" aria-label="Delete goal" title="Delete" loading={busy === `${item.goal.id}:delete` && pending} disabled={pending} onClick={() => run(`${item.goal.id}:delete`, () => deleteGoalAction(item.goal.id))}>
                  {!(busy === `${item.goal.id}:delete` && pending) && <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                </Button>
              </div>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.percent}% of goal`}>
            <div className={cn("h-full rounded-full", item.reached ? "bg-success" : "bg-primary")} style={{ width: `${item.percent}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

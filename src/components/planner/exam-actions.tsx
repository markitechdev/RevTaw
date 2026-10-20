"use client";

import { Archive, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { archiveExamAction, deleteExamAction, rebalancePlanAction, regeneratePlanAction, updatePlanSettingsAction } from "@/lib/planner/actions";
import { WEEKDAY_SHORT } from "@/lib/planner/dates";
import { DAILY_MINUTE_PRESETS, PLAN_MODES } from "@/lib/planner/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Delete (with confirmation) and archive for an exam. */
export function ExamDangerActions({ examId, archived }: { examId: string; archived: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteExamAction(examId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirm(false);
      router.push(routes.planner);
      router.refresh();
    });

  const archive = () =>
    startTransition(async () => {
      const result = await archiveExamAction(examId, !archived);
      if (!result.ok) setError(result.message);
      router.refresh();
    });

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={archive} loading={pending}>
        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        {archived ? "Unarchive" : "Archive"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </Button>
      <Dialog open={confirm} onClose={() => !pending && setConfirm(false)} title="Delete this exam?" description="Its plan and tasks are deleted too. Completed sessions stay in your history.">
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={pending} onClick={remove}>
              Delete exam
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Plan settings (days, minutes, mode) with regenerate and adjust-now. */
export function PlanSettings({ planId, mode, availableDays, minutesPerDay }: { planId: string; mode: "exam" | "cram"; availableDays: number[]; minutesPerDay: number }) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(availableDays);
  const [minutes, setMinutes] = useState(minutesPerDay);
  const [style, setStyle] = useState<"exam" | "cram">(mode);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = style !== mode || minutes !== minutesPerDay || days.join(",") !== availableDays.join(",");

  const toggleDay = (day: number) => setDays((state) => (state.includes(day) ? state.filter((item) => item !== day) : [...state, day].sort((a, b) => a - b)));

  const save = () => {
    setError(null);
    setNote(null);
    if (days.length === 0) return setError("Pick at least one study day.");
    setBusy("save");
    startTransition(async () => {
      const result = await updatePlanSettingsAction(planId, { mode: style, availableDays: days, minutesPerDay: Math.max(5, Math.min(480, Math.round(minutes) || 5)) });
      if (!result.ok) setError(result.message);
      else setNote("Plan regenerated with the new settings.");
      setBusy(null);
      router.refresh();
    });
  };

  const regenerate = () => {
    setError(null);
    setNote(null);
    setBusy("regenerate");
    startTransition(async () => {
      const result = await regeneratePlanAction(planId);
      if (!result.ok) setError(result.message);
      else setNote("Plan regenerated from today's mastery, mistakes and due reviews.");
      setBusy(null);
      router.refresh();
    });
  };

  const adjust = () => {
    setError(null);
    setNote(null);
    setBusy("adjust");
    startTransition(async () => {
      const result = await rebalancePlanAction(planId);
      if (!result.ok) setError(result.message);
      else setNote(result.data.note ?? "Nothing to adjust: the plan is on track.");
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Study days</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_SHORT.map((label, index) => (
            <button key={label} type="button" aria-pressed={days.includes(index)} disabled={pending} onClick={() => toggleDay(index)} className={cn("h-8 w-11 rounded-md border text-xs font-medium", days.includes(index) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Minutes per study day</p>
        <div className="flex flex-wrap items-center gap-2">
          {DAILY_MINUTE_PRESETS.map((preset) => (
            <Button key={preset} type="button" size="sm" variant={minutes === preset ? "primary" : "secondary"} disabled={pending} onClick={() => setMinutes(preset)}>
              {preset}
            </Button>
          ))}
          <Input aria-label="Custom minutes per day" type="number" min={5} max={480} value={minutes} disabled={pending} onChange={(event) => setMinutes(Number(event.target.value) || 5)} className="max-w-24" />
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan style</p>
        <div className="flex flex-wrap gap-2">
          {PLAN_MODES.map((item) => (
            <Button key={item.id} type="button" size="sm" variant={style === item.id ? "primary" : "secondary"} disabled={pending} onClick={() => setStyle(item.id)} title={item.hint}>
              {item.label}
            </Button>
          ))}
        </div>
        {style === "cram" && <p className="mt-2 text-xs text-warning">Cram Mode makes the most of limited time; it is not a substitute for regular spaced study.</p>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || pending} loading={busy === "save" && pending}>
          Save & regenerate
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={regenerate} disabled={pending} loading={busy === "regenerate" && pending}>
          {!(busy === "regenerate" && pending) && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Regenerate
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={adjust} disabled={pending} loading={busy === "adjust" && pending}>
          {!(busy === "adjust" && pending) && <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
          Adjust now
        </Button>
      </div>
    </div>
  );
}

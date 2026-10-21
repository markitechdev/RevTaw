"use client";

import { CalendarPlus, Pencil, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createExamAction, updateExamAction } from "@/lib/planner/actions";
import { WEEKDAY_SHORT } from "@/lib/planner/dates";
import { DAILY_MINUTE_PRESETS, EXAM_PRIORITIES, PLAN_MODES, type ExamFormInput } from "@/lib/planner/types";
import { CONFIDENCE_LEVELS } from "@/lib/quizzes/types";
import { clearQueryParam } from "@/lib/hooks/query-param";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type PlannerMaterialOption = { id: string; title: string; subject: string | null };
export type PlannerSubjectOption = { id: string; name: string };

export type ExamFormInitial = {
  title: string;
  examDate: string;
  subjectId: string | null;
  priority: ExamFormInput["priority"];
  confidence: ExamFormInput["confidence"];
  topics: string[];
  notes: string | null;
  materialIds: string[];
  plan: { mode: "exam" | "cram"; availableDays: number[]; minutesPerDay: number };
};

const EMPTY: ExamFormInitial = { title: "", examDate: "", subjectId: null, priority: "normal", confidence: null, topics: [], notes: null, materialIds: [], plan: { mode: "exam", availableDays: [0, 1, 2, 3, 4, 5, 6], minutesPerDay: 45 } };

/**
 * Exam form (§30): what the exam is, when, which materials it covers, how
 * confident the student is, and how much time on which days — RevTaw then
 * generates the plan.
 */
export function ExamDialogButton({
  materials,
  subjects,
  today,
  defaultMinutes,
  examId,
  initial,
  defaultOpen = false,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & {
  materials: PlannerMaterialOption[];
  subjects: PlannerSubjectOption[];
  today: string;
  defaultMinutes?: number | null;
  examId?: string;
  initial?: ExamFormInitial;
  /** Open on arrival (/planner?exam=new). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const base = initial ?? { ...EMPTY, plan: { ...EMPTY.plan, minutesPerDay: defaultMinutes && defaultMinutes >= 5 ? Math.min(480, defaultMinutes) : 45 } };
  const [title, setTitle] = useState(base.title);
  const [examDate, setExamDate] = useState(base.examDate);
  const [subjectId, setSubjectId] = useState(base.subjectId ?? "");
  const [priority, setPriority] = useState<ExamFormInput["priority"]>(base.priority);
  const [confidence, setConfidence] = useState<string>(base.confidence ?? "");
  const [topics, setTopics] = useState(base.topics.join(", "));
  const [notes, setNotes] = useState(base.notes ?? "");
  const [materialIds, setMaterialIds] = useState<string[]>(base.materialIds);
  const [mode, setMode] = useState<"exam" | "cram">(base.plan.mode);
  const [days, setDays] = useState<number[]>(base.plan.availableDays);
  const [minutes, setMinutes] = useState(base.plan.minutesPerDay);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(examId);

  const toggleDay = (day: number) => setDays((state) => (state.includes(day) ? state.filter((item) => item !== day) : [...state, day].sort((a, b) => a - b)));
  const toggleMaterial = (id: string) => setMaterialIds((state) => (state.includes(id) ? state.filter((item) => item !== id) : [...state, id]));

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("Give the exam a name.");
    if (!examDate) return setError("Pick the exam date.");
    if (examDate < today) return setError("The exam date is in the past.");
    if (days.length === 0) return setError("Pick at least one study day.");
    const input: ExamFormInput = {
      title: title.trim(),
      examDate,
      subjectId: subjectId || null,
      priority,
      confidence: (confidence || null) as ExamFormInput["confidence"],
      topics: topics.split(",").map((topic) => topic.trim()).filter(Boolean).slice(0, 30),
      notes: notes.trim() || null,
      materialIds,
      plan: { mode, availableDays: days, minutesPerDay: Math.max(5, Math.min(480, Math.round(minutes) || 5)) },
    };
    startTransition(async () => {
      const result = editing && examId ? await updateExamAction(examId, input) : await createExamAction(input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      if (!editing && result.data && "examId" in result.data) router.push(`${routes.planner}/${result.data.examId}`);
      else router.refresh();
    });
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...props}>
        {editing ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <CalendarPlus className="h-4 w-4" aria-hidden="true" />}
        {children ?? (editing ? "Edit" : "Add exam")}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          clearQueryParam("exam");
        }}
        dismissible={!pending} title={editing ? "Edit exam" : "Add an exam"} description="RevTaw builds a day-by-day plan from the date, the materials it covers and the time you have." className="max-w-2xl">
        <form
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="exam-title" label="Exam" required>
              <Input {...fieldA11y("exam-title")} value={title} maxLength={120} placeholder="e.g. Biology midterm" disabled={pending} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field id="exam-date" label="Date" required>
              <Input {...fieldA11y("exam-date")} type="date" min={today} value={examDate} disabled={pending} onChange={(event) => setExamDate(event.target.value)} />
            </Field>
            <Field id="exam-subject" label="Subject">
              <Select {...fieldA11y("exam-subject")} value={subjectId} disabled={pending} onChange={(event) => setSubjectId(event.target.value)}>
                <option value="">No subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="exam-confidence" label="How confident are you right now?">
              <Select {...fieldA11y("exam-confidence")} value={confidence} disabled={pending} onChange={(event) => setConfidence(event.target.value)}>
                <option value="">Not sure yet</option>
                {CONFIDENCE_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Priority</legend>
            <div className="flex flex-wrap gap-2">
              {EXAM_PRIORITIES.map((item) => (
                <label key={item.id} className={cn("cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary-soft")} title={item.hint}>
                  <input type="radio" name="exam-priority" value={item.id} checked={priority === item.id} onChange={() => setPriority(item.id)} className="sr-only" />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Materials this exam covers</legend>
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No processed materials yet. You can still plan with topics; attach materials later for recall sessions and tests.</p>
            ) : (
              <ul className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {materials.map((material) => (
                  <li key={material.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={materialIds.includes(material.id)} onChange={() => toggleMaterial(material.id)} className="mt-0.5 h-4 w-4 accent-primary" />
                      <span className="min-w-0">
                        <span className="block truncate">{material.title}</span>
                        {material.subject && <span className="block truncate text-xs text-muted-foreground">{material.subject}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <Field id="exam-topics" label="Topics (optional)" hint="Comma-separated. Used for focus blocks when no material covers a topic.">
            <Input {...fieldA11y("exam-topics")} value={topics} maxLength={600} placeholder="e.g. Chapter 4, Enzymes, Cell cycle" disabled={pending} onChange={(event) => setTopics(event.target.value)} />
          </Field>

          <fieldset disabled={pending} className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Your time</legend>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Study days</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_SHORT.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={days.includes(index)}
                      onClick={() => toggleDay(index)}
                      className={cn("h-8 w-11 rounded-md border text-xs font-medium", days.includes(index) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Minutes per study day</p>
                <div className="flex flex-wrap items-center gap-2">
                  {DAILY_MINUTE_PRESETS.map((preset) => (
                    <Button key={preset} type="button" size="sm" variant={minutes === preset ? "primary" : "secondary"} onClick={() => setMinutes(preset)}>
                      {preset}
                    </Button>
                  ))}
                  <Input aria-label="Custom minutes per day" type="number" min={5} max={480} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 5)} className="max-w-24" />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan style</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PLAN_MODES.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-primary has-checked:bg-primary-soft">
                      <input type="radio" name="exam-mode" value={item.id} checked={mode === item.id} onChange={() => setMode(item.id)} className="mt-0.5 h-4 w-4 accent-primary" />
                      <span className="flex flex-col">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{item.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {mode === "cram" && <p className="mt-2 text-xs text-warning">Cram Mode makes the most of limited time; it is not a substitute for regular spaced study.</p>}
              </div>
            </div>
          </fieldset>

          <Field id="exam-notes" label="Notes (optional)">
            <Textarea {...fieldA11y("exam-notes")} rows={2} maxLength={2000} value={notes} disabled={pending} placeholder="Coverage, format, what the teacher emphasised…" onChange={(event) => setNotes(event.target.value)} />
          </Field>

          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Building the plan from your materials, mastery and mistakes…
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Save & update plan" : "Create exam & plan"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

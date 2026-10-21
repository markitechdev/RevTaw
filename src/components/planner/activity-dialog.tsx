"use client";

import { BellRing, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { REMINDERS_CHANGED_EVENT } from "@/components/planner/reminder-events";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useNow } from "@/lib/hooks/use-now";
import { deleteTaskAction, saveActivityAction } from "@/lib/planner/actions";
import { dateIn, formatDate } from "@/lib/planner/dates";
import type { TaskView } from "@/lib/planner/queries";
import { formatClock, shortTime } from "@/lib/planner/time";
import { ACTIVITY_CATEGORIES, categoryOf, methodNeedsMaterial, TASK_REMINDERS, type ActivityMethod } from "@/lib/planner/types";
import { ALL_DAY_REMINDER_TIME, remindAtFor } from "@/lib/reminders/time";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";
import type { ActivityCategory, ExamPriority, TaskReminder } from "@/lib/supabase/database.types";

/** Everything the form needs from the page: pickers, today and where reminders are computed. */
export type ActivityOptions = {
  materials: ReadonlyArray<{ id: string; title: string }>;
  subjects: ReadonlyArray<{ id: string; name: string }>;
  today: string;
  timezone: string | null;
  /** Settings → Notifications: the reminder new activities start with. */
  defaultReminder: TaskReminder;
};

const STUDY_METHODS: ActivityMethod[] = ["active_recall", "practice_testing", "feynman", "error_review", "spaced_repetition", "pomodoro"];
const REVIEW_METHODS: ActivityMethod[] = ["review", "spaced_repetition"];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const UNITS = [
  { id: "minutes", label: "minutes", factor: 1 },
  { id: "hours", label: "hours", factor: 60 },
  { id: "days", label: "days", factor: 1440 },
] as const;
type Unit = (typeof UNITS)[number]["id"];

const PRIORITIES: ReadonlyArray<{ value: ExamPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

function methodName(method: ActivityMethod): string {
  if (method === "review") return "Scheduled review (recall on the material)";
  if (method === "spaced_repetition") return "Flashcards that are due";
  if (method === "activity") return "No session";
  return STUDY_METHOD_BY_ID[method].name;
}

function defaultMethod(category: ActivityCategory, hasMaterial: boolean): ActivityMethod {
  if (category === "study") return hasMaterial ? "active_recall" : "pomodoro";
  if (category === "review") return hasMaterial ? "review" : "spaced_repetition";
  return "activity";
}

function splitMinutes(minutes: number | null): { amount: number; unit: Unit } {
  if (minutes && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes ?? 15, unit: "minutes" };
}

/**
 * Add or edit a calendar activity (UI phase §26–§27): title, category, date,
 * time, duration, study method and material, subject, priority, notes and a
 * reminder. The reminder time is previewed as you type, in your time zone.
 */
function ActivityForm({ options, date, task, examId, onDone, onCancel }: { options: ActivityOptions; date: string; task: TaskView | null; examId: string | null; onDone: () => void; onCancel: () => void }) {
  const router = useRouter();
  const now = useNow();
  const initialCategory = task ? categoryOf(task) : "study";
  const custom = splitMinutes(task?.reminder === "custom" ? task.reminder_minutes : null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState<ActivityCategory>(initialCategory);
  const [scheduledFor, setScheduledFor] = useState(task?.scheduled_for ?? date);
  const [startsAt, setStartsAt] = useState(task?.starts_at ? shortTime(task.starts_at) : "");
  const [minutes, setMinutes] = useState(task?.minutes ?? 30);
  // A new study activity starts on your first material, like the session builder; other categories start with none.
  const [materialId, setMaterialId] = useState(task ? (task.material_id ?? "") : (options.materials[0]?.id ?? ""));
  const [materialChosen, setMaterialChosen] = useState(Boolean(task));
  const [method, setMethod] = useState<ActivityMethod>((task?.method as ActivityMethod | undefined) ?? defaultMethod(initialCategory, options.materials.length > 0));
  const [subjectId, setSubjectId] = useState(task?.subject_id ?? "");
  const [priority, setPriority] = useState<ExamPriority>(task?.priority ?? "normal");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [reminder, setReminder] = useState<TaskReminder>(task?.reminder ?? options.defaultReminder);
  const [amount, setAmount] = useState(custom.amount);
  const [unit, setUnit] = useState<Unit>(custom.unit);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const methods = category === "study" ? STUDY_METHODS : category === "review" ? REVIEW_METHODS : [];
  const effectiveMethod: ActivityMethod = methods.length === 0 ? "activity" : methods.includes(method) ? method : methods[0];
  const needsMaterial = methodNeedsMaterial(effectiveMethod);
  const reminderMinutes = reminder === "custom" ? Math.round(Math.max(0, amount) * UNITS.find((item) => item.id === unit)!.factor) : null;
  const remindAt = /^\d{4}-\d{2}-\d{2}$/.test(scheduledFor) ? remindAtFor({ date: scheduledFor, time: startsAt || null, reminder, reminderMinutes, timeZone: options.timezone }) : null;

  let reminderHint: string | null = null;
  if (reminder !== "none" && remindAt) {
    const clock = new Intl.DateTimeFormat("en-US", { timeZone: options.timezone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(remindAt);
    reminderHint = now !== null && remindAt.getTime() < now ? "That time has already passed, so this reminder will not be sent." : `RevTaw reminds you ${formatDate(dateIn(remindAt, options.timezone), options.today)} at ${clock}${startsAt ? "" : ` (no time set, so reminders count from ${formatClock(ALL_DAY_REMINDER_TIME)})`}.`;
  }

  const changeCategory = (next: ActivityCategory) => {
    setCategory(next);
    setMethod(defaultMethod(next, Boolean(materialId) || options.materials.length > 0));
    // Until the student picks one, study and review start on a material and the rest on none.
    if (!materialChosen) setMaterialId(next === "study" || next === "review" ? (options.materials[0]?.id ?? "") : "");
  };

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("Give the activity a name.");
    if (needsMaterial && !materialId) return setError("Choose a material for this study method.");
    if (reminder === "custom" && (!Number.isFinite(amount) || amount <= 0)) return setError("Say how long before the reminder should come.");
    startTransition(async () => {
      const result = await saveActivityAction(
        {
          title: title.trim(),
          category,
          scheduledFor,
          startsAt: startsAt || null,
          minutes: Math.max(5, Math.min(480, Math.round(minutes) || 5)),
          method: effectiveMethod,
          materialId: materialId || null,
          subjectId: subjectId || null,
          examId: task ? (task.exam_id ?? null) : examId,
          priority,
          notes: notes.trim() || null,
          reminder,
          reminderMinutes,
        },
        task?.id ?? null,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
      router.refresh();
      onDone();
    });
  };

  const remove = () => {
    if (!task) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (!result.ok) {
        setError(result.message ?? "The activity could not be deleted.");
        return;
      }
      window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
      router.refresh();
      onDone();
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field id="task-title" label="Title" required>
        <Input {...fieldA11y("task-title")} value={title} maxLength={160} placeholder="e.g. Finish the lab report" disabled={pending} onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <ChipGroup type="single" name="activity-category" legend="Category" value={category} onChange={changeCategory} options={ACTIVITY_CATEGORIES.map((item) => ({ value: item.id, label: item.label }))} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="task-date" label="Date" required>
          <Input {...fieldA11y("task-date")} type="date" value={scheduledFor} disabled={pending} onChange={(event) => setScheduledFor(event.target.value)} />
        </Field>
        <Field id="task-time" label="Time" hint="Optional">
          <Input {...fieldA11y("task-time", undefined, "Optional")} type="time" value={startsAt} disabled={pending} onChange={(event) => setStartsAt(event.target.value)} />
        </Field>
        <Field id="task-minutes" label="Minutes" required>
          <Input {...fieldA11y("task-minutes")} type="number" min={5} max={480} step={5} list="activity-durations" value={minutes} disabled={pending} onChange={(event) => setMinutes(Number(event.target.value) || 5)} />
          <datalist id="activity-durations">
            {DURATIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {methods.length > 0 && (
          <Field id="task-method" label="Study method">
            <Select {...fieldA11y("task-method")} value={effectiveMethod} disabled={pending} onChange={(event) => setMethod(event.target.value as ActivityMethod)}>
              {methods.map((id) => (
                <option key={id} value={id}>
                  {methodName(id)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id="task-material" label="Material" required={needsMaterial}>
          <Select
            {...fieldA11y("task-material")}
            value={materialId}
            disabled={pending}
            onChange={(event) => {
              setMaterialId(event.target.value);
              setMaterialChosen(true);
            }}
          >
            <option value="">{needsMaterial ? "Choose a material" : "None"}</option>
            {options.materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="task-subject" label="Subject">
          <Select {...fieldA11y("task-subject")} value={subjectId} disabled={pending} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">None</option>
            {options.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
        <Segmented label="Priority" hideLabel={false} name="activity-priority" value={priority} onChange={setPriority} options={PRIORITIES} />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field id="task-reminder" label="Reminder">
            <Select {...fieldA11y("task-reminder")} value={reminder} disabled={pending} onChange={(event) => setReminder(event.target.value as TaskReminder)}>
              {TASK_REMINDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {reminder === "custom" && (
            <div className="flex items-end gap-2">
              <Field id="task-reminder-amount" label="How long before">
                <Input {...fieldA11y("task-reminder-amount")} type="number" min={1} max={unit === "days" ? 14 : unit === "hours" ? 336 : 20160} value={amount} disabled={pending} onChange={(event) => setAmount(Number(event.target.value))} className="w-24" />
              </Field>
              <div className="flex flex-col">
                <label htmlFor="task-reminder-unit" className="sr-only">
                  Unit
                </label>
                <Select id="task-reminder-unit" value={unit} disabled={pending} onChange={(event) => setUnit(event.target.value as Unit)} className="w-28">
                  {UNITS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>
        {reminderHint && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            {reminderHint}
          </p>
        )}
      </div>

      <Field id="task-notes" label="Notes">
        <Textarea {...fieldA11y("task-notes")} value={notes} maxLength={2000} rows={3} placeholder="What to bring, pages to cover, who you are meeting…" disabled={pending} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div>
          {task && task.kind === "custom" && !confirmDelete && (
            <Button type="button" variant="ghost" className="text-danger hover:bg-danger-soft" disabled={pending} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          )}
          {confirmDelete && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-foreground" role="group" aria-label="Confirm delete">
              Delete this activity?
              <Button type="button" size="sm" variant="danger" loading={pending} onClick={remove}>
                Yes, delete
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {task ? "Save changes" : "Add activity"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The dialog around the form; the form starts fresh every time it opens. */
export function ActivityDialog({
  open,
  onClose,
  options,
  date,
  task = null,
  examId = null,
}: {
  open: boolean;
  onClose: () => void;
  options: ActivityOptions;
  date: string;
  task?: TaskView | null;
  examId?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit activity" : `Add an activity on ${formatDate(date, options.today)}`}
      description={task ? undefined : "Study sessions start from here; assignments, classes and the rest go on your calendar, with a reminder if you like."}
      className="max-w-2xl"
    >
      {open && <ActivityForm options={options} date={date} task={task} examId={examId} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}

/** A button that opens the dialog for a new activity. */
export function AddActivityButton({
  options,
  date,
  examId = null,
  label = "Add activity",
  variant = "secondary",
  size = "sm",
}: {
  options: ActivityOptions;
  date?: string;
  examId?: string | null;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <ActivityDialog open={open} onClose={() => setOpen(false)} options={options} date={date ?? options.today} examId={examId} />
    </>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { deleteTaskAction, saveActivityAction } from "@/lib/planner/actions";
import { formatDate } from "@/lib/planner/dates";
import type { TaskView } from "@/lib/planner/queries";
import { shortTime } from "@/lib/planner/time";
import { ACTIVITY_CATEGORIES, categoryOf, methodNeedsMaterial, type ActivityMethod } from "@/lib/planner/types";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";
import type { ActivityCategory, ExamPriority } from "@/lib/supabase/database.types";

/** Everything the form needs from the page: the pickers and today. */
export type ActivityOptions = {
  materials: ReadonlyArray<{ id: string; title: string }>;
  subjects: ReadonlyArray<{ id: string; name: string }>;
  today: string;
};

const STUDY_METHODS: ActivityMethod[] = ["active_recall", "practice_testing", "feynman", "error_review", "spaced_repetition", "pomodoro"];
const REVIEW_METHODS: ActivityMethod[] = ["review", "spaced_repetition"];
const DURATIONS = [15, 30, 45, 60, 90, 120];

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

/**
 * Add or edit a calendar activity (UI phase §26): title, category, date,
 * time, duration, study method and material, subject, priority and notes.
 */
function ActivityForm({ options, date, task, examId, onDone, onCancel }: { options: ActivityOptions; date: string; task: TaskView | null; examId: string | null; onDone: () => void; onCancel: () => void }) {
  const router = useRouter();
  const initialCategory = task ? categoryOf(task) : "study";
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
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const methods = category === "study" ? STUDY_METHODS : category === "review" ? REVIEW_METHODS : [];
  const effectiveMethod: ActivityMethod = methods.length === 0 ? "activity" : methods.includes(method) ? method : methods[0];
  const needsMaterial = methodNeedsMaterial(effectiveMethod);
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
        },
        task?.id ?? null,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
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
      description={task ? undefined : "Study sessions start from here; assignments, classes and the rest go on your calendar."}
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

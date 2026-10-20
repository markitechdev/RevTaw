"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addCustomTaskAction } from "@/lib/planner/actions";
import type { CustomTaskInput } from "@/lib/planner/types";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";

const METHODS: CustomTaskInput["method"][] = ["active_recall", "practice_testing", "feynman", "error_review", "spaced_repetition", "pomodoro", "review"];

/** Lets the student add their own task to a day (§53 planner tasks). */
export function AddTaskButton({ materials, today, examId = null, defaultDate }: { materials: Array<{ id: string; title: string }>; today: string; examId?: string | null; defaultDate?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ?? today);
  const [minutes, setMinutes] = useState(15);
  const [method, setMethod] = useState<CustomTaskInput["method"]>("active_recall");
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsMaterial = method !== "error_review" && method !== "spaced_repetition" && method !== "pomodoro";

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("Give the task a name.");
    if (needsMaterial && !materialId) return setError("Choose a material for this method.");
    startTransition(async () => {
      const result = await addCustomTaskAction({ title: title.trim(), scheduledFor: date, minutes: Math.max(5, Math.min(480, Math.round(minutes) || 5)), method, materialId: needsMaterial ? materialId || null : null, examId });
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
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add task
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} dismissible={!pending} title="Add a task" description="Your own item on the schedule. Starting it opens a session of that method.">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field id="task-title" label="Task" required>
            <Input {...fieldA11y("task-title")} value={title} maxLength={160} placeholder="e.g. Re-read Chapter 4 summary" disabled={pending} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="task-date" label="Date" required>
              <Input {...fieldA11y("task-date")} type="date" min={today} value={date} disabled={pending} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field id="task-minutes" label="Minutes" required>
              <Input {...fieldA11y("task-minutes")} type="number" min={5} max={480} value={minutes} disabled={pending} onChange={(event) => setMinutes(Number(event.target.value) || 5)} />
            </Field>
            <Field id="task-method" label="Method">
              <Select {...fieldA11y("task-method")} value={method} disabled={pending} onChange={(event) => setMethod(event.target.value as CustomTaskInput["method"])}>
                {METHODS.map((id) => (
                  <option key={id} value={id}>
                    {id === "review" ? "Scheduled review" : STUDY_METHOD_BY_ID[id].name}
                  </option>
                ))}
              </Select>
            </Field>
            {needsMaterial && (
              <Field id="task-material" label="Material" required>
                <Select {...fieldA11y("task-material")} value={materialId} disabled={pending} onChange={(event) => setMaterialId(event.target.value)}>
                  {materials.length === 0 && <option value="">No processed materials</option>}
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add task
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

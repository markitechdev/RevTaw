"use client";

import { ArrowDown, ArrowUp, ListPlus, Pencil, Play, Plus, Repeat, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteRoutineAction, saveRoutineAction, startRoutineAction } from "@/lib/study/actions";
import { BUILDER_METHOD_IDS, isTestMethod, METHOD_BEHAVIOUR, methodName } from "@/lib/study/catalog";

export type RoutineMaterialOption = { id: string; title: string };
export type RoutineBlockInput = { method: string; minutes: number; materialId?: string | null; questionCount?: number };
export type RoutineItem = { id: string; title: string; description: string | null; blocks: RoutineBlockInput[]; totalMinutes: number; last_used_at: string | null };

const ROUTINE_METHODS = BUILDER_METHOD_IDS.filter((id) => id !== "smart_study" && id !== "flashcards");

const EXAMPLE: RoutineBlockInput[] = [
  { method: "pomodoro", minutes: 25 },
  { method: "active_recall", minutes: 20 },
  { method: "spaced_repetition", minutes: 10 },
  { method: "error_review", minutes: 10 },
];

/** Builder for a custom routine (§16 "Custom Study Routine"). */
function RoutineDialog({ open, onClose, materials, routine }: { open: boolean; onClose: () => void; materials: RoutineMaterialOption[]; routine: RoutineItem | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(routine?.title ?? "My Exam Routine");
  const [blocks, setBlocks] = useState<RoutineBlockInput[]>(routine?.blocks ?? EXAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (index: number, patch: Partial<RoutineBlockInput>) => setBlocks((state) => state.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  const move = (index: number, delta: number) =>
    setBlocks((state) => {
      const next = [...state];
      const target = index + delta;
      if (target < 0 || target >= next.length) return state;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = () => {
    setError(null);
    if (!title.trim()) return setError("Give the routine a name.");
    if (blocks.length === 0) return setError("Add at least one block.");
    startTransition(async () => {
      const result = await saveRoutineAction(
        {
          title: title.trim(),
          blocks: blocks.map((block) => ({
            method: block.method,
            minutes: Math.max(1, Math.min(240, Math.round(block.minutes) || 1)),
            materialId: block.materialId || null,
            ...(isTestMethod(block.method) ? { questionCount: Math.max(3, Math.min(50, block.questionCount ?? 10)) } : {}),
          })),
        },
        routine?.id ?? null,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onClose={() => !pending && onClose()} dismissible={!pending} title={routine ? "Edit routine" : "New routine"} description="An ordered set of blocks you can start in one click. Blocks without a material use the one you pick when starting." className="max-w-2xl">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <Field id="routine-title" label="Name" required>
          <Input {...fieldA11y("routine-title")} value={title} maxLength={120} disabled={pending} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <ol className="flex flex-col gap-2">
          {blocks.map((block, index) => (
            <li key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor={`routine-method-${index}`} className="text-xs font-medium text-muted-foreground">
                  Block {index + 1}
                </label>
                <Select id={`routine-method-${index}`} value={block.method} disabled={pending} onChange={(event) => update(index, { method: event.target.value })}>
                  {ROUTINE_METHODS.map((id) => (
                    <option key={id} value={id}>
                      {methodName(id)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`routine-minutes-${index}`} className="text-xs font-medium text-muted-foreground">
                  Minutes
                </label>
                <Input id={`routine-minutes-${index}`} type="number" min={1} max={240} value={block.minutes} disabled={pending} onChange={(event) => update(index, { minutes: Number(event.target.value) || 1 })} className="w-24" />
              </div>
              {isTestMethod(block.method) && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`routine-count-${index}`} className="text-xs font-medium text-muted-foreground">
                    Questions
                  </label>
                  <Input id={`routine-count-${index}`} type="number" min={3} max={50} value={block.questionCount ?? 10} disabled={pending} onChange={(event) => update(index, { questionCount: Number(event.target.value) || 10 })} className="w-24" />
                </div>
              )}
              {METHOD_BEHAVIOUR[block.method as keyof typeof METHOD_BEHAVIOUR]?.requiresMaterial && materials.length > 0 && (
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor={`routine-material-${index}`} className="text-xs font-medium text-muted-foreground">
                    Material
                  </label>
                  <Select id={`routine-material-${index}`} value={block.materialId ?? ""} disabled={pending} onChange={(event) => update(index, { materialId: event.target.value || null })}>
                    <option value="">Chosen when starting</option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label={`Move block ${index + 1} up`} disabled={pending || index === 0} onClick={() => move(index, -1)} className="h-8 w-8">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Move block ${index + 1} down`} disabled={pending || index === blocks.length - 1} onClick={() => move(index, 1)} className="h-8 w-8">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove block ${index + 1}`} disabled={pending} onClick={() => setBlocks((state) => state.filter((_, i) => i !== index))} className="h-8 w-8">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button type="button" size="sm" variant="secondary" disabled={pending || blocks.length >= 12} onClick={() => setBlocks((state) => [...state, { method: "active_recall", minutes: 15 }])}>
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Add block
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Total: {blocks.reduce((sum, block) => sum + (Number(block.minutes) || 0), 0)} minutes</p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save routine
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Saved routines with start / edit / delete (shown on the Study page). */
export function RoutinesCard({ routines, materials }: { routines: RoutineItem[]; materials: RoutineMaterialOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = (routine: RoutineItem) => {
    setError(null);
    setBusy(`start:${routine.id}`);
    startTransition(async () => {
      const result = await startRoutineAction({ routineId: routine.id, materialId: materialId || null });
      if (!result.ok) {
        setError(result.message);
        setBusy(null);
        return;
      }
      router.push(result.data.redirect);
    });
  };

  const remove = (routine: RoutineItem) => {
    setError(null);
    setBusy(`delete:${routine.id}`);
    startTransition(async () => {
      const result = await deleteRoutineAction(routine.id);
      if (!result.ok) setError(result.message);
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <Card id="routines" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" aria-hidden="true" />
          Routines
        </CardTitle>
        <CardDescription>Your saved combinations of methods, run as one session.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        {routines.length > 0 && materials.length > 0 && (
          <Field id="routine-start-material" label="Material for blocks without one">
            <Select {...fieldA11y("routine-start-material")} value={materialId} disabled={pending} onChange={(event) => setMaterialId(event.target.value)}>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.title}
                </option>
              ))}
              <option value="">No material</option>
            </Select>
          </Field>
        )}
        {routines.length === 0 ? (
          <p className="text-sm text-muted-foreground">For example: 25-minute Pomodoro, 20 minutes of active recall, due flashcards, then mistake review.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {routines.map((routine) => (
              <li key={routine.id} className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{routine.title}</p>
                  <Badge tone="neutral">{routine.totalMinutes} min</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{routine.blocks.map((block) => `${methodName(block.method)} ${block.minutes}′`).join(" → ")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" loading={busy === `start:${routine.id}` && pending} disabled={pending && busy !== `start:${routine.id}`} onClick={() => start(routine)}>
                    {!(busy === `start:${routine.id}` && pending) && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                    Start
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(routine)} aria-label={`Edit ${routine.title}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" loading={busy === `delete:${routine.id}` && pending} disabled={pending && busy !== `delete:${routine.id}`} onClick={() => remove(routine)} aria-label={`Delete ${routine.title}`}>
                    {!(busy === `delete:${routine.id}` && pending) && <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New routine
          </Button>
        </div>
      </CardContent>
      {creating && <RoutineDialog open onClose={() => setCreating(false)} materials={materials} routine={null} />}
      {editing && <RoutineDialog key={editing.id} open onClose={() => setEditing(null)} materials={materials} routine={editing} />}
    </Card>
  );
}

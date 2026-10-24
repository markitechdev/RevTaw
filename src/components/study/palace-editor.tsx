"use client";

import { ArrowDown, ArrowUp, Castle, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Field } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SECTION_TITLE } from "@/components/ui/typography";
import { routes } from "@/lib/routes";
import { PALACE_SUGGESTIONS, type PalaceInput, type PalaceLocation, type PalaceSummary } from "@/lib/study/memory-options";
import { deletePalaceAction, savePalaceAction } from "@/lib/study/method-actions";

/**
 * The route is checked with the server's own schema before it is sent. It (and
 * zod with it) loads when the editor opens; a repeated import resolves from the
 * module cache.
 */
const loadMemorySchemas = () => import("@/lib/study/memory-schemas");

type Row = { key: string; name: string; detail: string };

function rowsOf(locations: PalaceLocation[]): Row[] {
  const base = locations.length ? locations : [{ name: "", detail: null }, { name: "", detail: null }, { name: "", detail: null }];
  return base.map((location, index) => ({ key: `row-${index}`, name: location.name, detail: location.detail ?? "" }));
}

/** Route editor for a memory palace (§16: students define the locations), in walking order. */
export function PalaceEditor({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; locations: PalaceLocation[] };
  submitLabel: string;
  pending: boolean;
  onSubmit: (value: PalaceInput) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial.locations));
  const [error, setError] = useState<string | null>(null);
  const used = new Set(rows.map((row) => row.name.trim().toLowerCase()));

  const update = (key: string, patch: Partial<Row>) => setRows((state) => state.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, offset: number) =>
    setRows((state) => {
      const next = [...state];
      const [row] = next.splice(index, 1);
      next.splice(index + offset, 0, row);
      return next;
    });
  const add = (name = "") =>
    setRows((state) => {
      const empty = name ? state.findIndex((row) => !row.name.trim()) : -1;
      if (empty !== -1) return state.map((row, index) => (index === empty ? { ...row, name } : row));
      return state.length >= 30 ? state : [...state, { key: `row-${crypto.randomUUID()}`, name, detail: "" }];
    });

  useEffect(() => {
    void loadMemorySchemas().catch(() => undefined);
  }, []);

  // One check at a time: a second press while the schema loads does nothing.
  const checking = useRef(false);
  const submit = async () => {
    if (checking.current) return;
    checking.current = true;
    let schemas: Awaited<ReturnType<typeof loadMemorySchemas>>;
    try {
      schemas = await loadMemorySchemas();
    } catch {
      setError("RevTaw couldn't check the route. Check your connection and try again.");
      return;
    } finally {
      checking.current = false;
    }
    const parsed = schemas.palaceInputSchema.safeParse({ title, locations: rows.map((row) => ({ name: row.name, detail: row.detail.trim() || null })) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the route.");
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field id="palace-title" label="Palace name" required hint="A place you can walk through in your mind: your home, your street, your route to school.">
        <Input id="palace-title" aria-describedby="palace-title-hint" required maxLength={120} value={title} disabled={pending} placeholder="My home" onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm font-medium">The route, in walking order</legend>
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 sm:contents">
                <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-primary" aria-hidden="true">
                  {index + 1}
                </span>
                <Input aria-label={`Location ${index + 1}`} maxLength={80} value={row.name} placeholder="e.g. Front door" onChange={(event) => update(row.key, { name: event.target.value })} className="sm:w-48" />
              </span>
              <Input aria-label={`What location ${index + 1} looks like (optional)`} maxLength={160} value={row.detail} placeholder="What it looks like (optional)" onChange={(event) => update(row.key, { detail: event.target.value })} />
              <span className="flex shrink-0 justify-end gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label={`Move location ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Move location ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove location ${index + 1}`} disabled={rows.length <= 3} onClick={() => setRows((state) => state.filter((entry) => entry.key !== row.key))}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={rows.length >= 30} onClick={() => add()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add location
          </Button>
          <span className="text-xs text-muted-foreground">{rows.length} of 30</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick add a location" role="group">
          <span className="text-xs text-muted-foreground">Quick add:</span>
          {PALACE_SUGGESTIONS.filter((name) => !used.has(name.toLowerCase())).map((name) => (
            <button key={name} type="button" onClick={() => add(name)} className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-60">
              {name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A route at a glance: "Front door → Hallway → Kitchen table". */
export function RouteLine({ locations, max = 6 }: { locations: PalaceLocation[]; max?: number }) {
  const shown = locations.slice(0, max).map((location) => location.name);
  return (
    <p className="text-sm text-muted-foreground">
      {shown.join(" → ")}
      {locations.length > max ? ` → … (${locations.length - max} more)` : ""}
    </p>
  );
}

function PalaceCard({ palace, onEdit, lastUsedLabel }: { palace: PalaceSummary; onEdit: () => void; lastUsedLabel: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deletePalaceAction({ id: palace.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-labelledby={`palace-${palace.id}`}>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id={`palace-${palace.id}`} className="font-medium">
          {palace.title}
        </h3>
        <span className="text-xs text-muted-foreground">· {palace.locations.length} locations</span>
      </div>
      <RouteLine locations={palace.locations} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{lastUsedLabel}</span>
        <ConfirmDialog
          open={confirming}
          title="Delete this palace?"
          description={`“${palace.title}” and its route are removed. Sessions you walked it in stay in your history.`}
          confirmLabel="Delete palace"
          pending={pending}
          error={confirming ? error : null}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
        <span className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit the route of ${palace.title}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${palace.title}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        </span>
      </div>
    </li>
  );
}

/** The student's memory palaces on the memory aids page: create, edit and delete routes. */
export function PalaceLibrary({ palaces, lastUsedLabels }: { palaces: PalaceSummary[]; lastUsedLabels: Record<string, string> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PalaceSummary | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: PalaceInput) => {
    setError(null);
    startTransition(async () => {
      const result = await savePalaceAction({ ...value, id: editing && editing !== "new" ? editing.id : null });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="palaces-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="palaces-heading" className={SECTION_TITLE}>
          Memory palaces
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {palaces.length > 0 && (
            <Link href={`${routes.study}?method=memory_palace`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              Walk a palace
            </Link>
          )}
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New palace
          </Button>
        </div>
      </div>
      {palaces.length === 0 ? (
        <EmptyState icon={Castle} title="No memory palaces yet" description="Build a route of places you know, then a Memory Palace session puts one key concept at each stop." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {palaces.map((palace) => (
            <PalaceCard key={palace.id} palace={palace} lastUsedLabel={lastUsedLabels[palace.id] ?? "not walked yet"} onEdit={() => setEditing(palace)} />
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? `Edit ${editing.title}` : "New memory palace"} description="Locations in the order you walk past them." className="max-w-2xl">
        {error && <Alert tone="error">{error}</Alert>}
        {editing && (
          <PalaceEditor
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? { title: "", locations: [] } : { title: editing.title, locations: editing.locations }}
            submitLabel="Save palace"
            pending={pending}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

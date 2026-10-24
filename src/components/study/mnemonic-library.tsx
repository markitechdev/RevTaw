"use client";

import { Brain, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { routes } from "@/lib/routes";
import { MNEMONIC_KIND_LABEL, MNEMONIC_KINDS } from "@/lib/study/memory-options";
import { createMnemonicAction, deleteMnemonicAction, setMnemonicFavoriteAction, updateMnemonicAction } from "@/lib/study/method-actions";
import type { MnemonicKind } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type LibraryMnemonic = {
  id: string;
  kind: MnemonicKind;
  target: string;
  items: string[];
  content: string;
  explanation: string | null;
  source: "ai" | "user";
  favorite: boolean;
  material: { id: string; title: string } | null;
  /** "practiced 2 days ago" / "not practiced yet", formatted on the server. */
  practicedLabel: string;
};

type FormState = { kind: MnemonicKind; target: string; items: string; content: string; explanation: string; materialId: string };

const EMPTY_FORM: FormState = { kind: "custom", target: "", items: "", content: "", explanation: "", materialId: "" };

function formOf(mnemonic: LibraryMnemonic): FormState {
  return { kind: mnemonic.kind, target: mnemonic.target, items: mnemonic.items.join("\n"), content: mnemonic.content, explanation: mnemonic.explanation ?? "", materialId: mnemonic.material?.id ?? "" };
}

/** Add or edit a mnemonic (spec §16: students can save their own). */
function MnemonicForm({ initial, materials, editingId, onDone }: { initial: FormState; materials: Array<{ id: string; title: string }>; editingId: string | null; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const input = {
      kind: form.kind,
      target: form.target,
      items: form.items
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      content: form.content,
      explanation: form.explanation.trim() || null,
      materialId: form.materialId || null,
    };
    startTransition(async () => {
      const result = editingId ? await updateMnemonicAction(editingId, input) : await createMnemonicAction(input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field id="mnemonic-kind" label="Kind">
        <Select {...fieldA11y("mnemonic-kind")} value={form.kind} disabled={pending} onChange={(event) => setForm({ ...form, kind: event.target.value as MnemonicKind })}>
          {MNEMONIC_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {MNEMONIC_KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="mnemonic-target" label="What it helps you remember" required>
        <Input {...fieldA11y("mnemonic-target")} required maxLength={200} value={form.target} disabled={pending} placeholder="The stages of mitosis, in order" onChange={(event) => setForm({ ...form, target: event.target.value })} />
      </Field>
      <Field id="mnemonic-items" label="The items, one per line" hint="Optional. With at least two items you can practice recalling the list from the mnemonic.">
        <Textarea {...fieldA11y("mnemonic-items", undefined, "hint")} rows={4} value={form.items} disabled={pending} onChange={(event) => setForm({ ...form, items: event.target.value })} />
      </Field>
      <Field id="mnemonic-content" label="Mnemonic" required>
        <Textarea {...fieldA11y("mnemonic-content")} required rows={3} maxLength={2000} value={form.content} disabled={pending} onChange={(event) => setForm({ ...form, content: event.target.value })} />
      </Field>
      <Field id="mnemonic-explanation" label="How it maps (optional)">
        <Textarea {...fieldA11y("mnemonic-explanation")} rows={2} maxLength={2000} value={form.explanation} disabled={pending} onChange={(event) => setForm({ ...form, explanation: event.target.value })} />
      </Field>
      <Field id="mnemonic-material" label="Material (optional)">
        <Select {...fieldA11y("mnemonic-material")} value={form.materialId} disabled={pending} onChange={(event) => setForm({ ...form, materialId: event.target.value })}>
          <option value="">No material</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {editingId ? "Save changes" : "Save mnemonic"}
        </Button>
      </div>
    </form>
  );
}

function MnemonicCard({ mnemonic, onEdit }: { mnemonic: LibraryMnemonic; onEdit: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "That did not work. Please try again.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby={`mnemonic-${mnemonic.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone="primary">{MNEMONIC_KIND_LABEL[mnemonic.kind]}</Badge>
          <Badge tone="neutral">{mnemonic.source === "ai" ? "Generated" : "Yours"}</Badge>
        </div>
        <button
          type="button"
          aria-pressed={mnemonic.favorite}
          aria-label={mnemonic.favorite ? "Remove from favorites" : "Add to favorites"}
          disabled={pending}
          onClick={() => run(() => setMnemonicFavoriteAction({ id: mnemonic.id, favorite: !mnemonic.favorite }))}
          className="-m-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          <Star className={cn("h-4 w-4", mnemonic.favorite && "fill-warning text-warning")} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <h3 id={`mnemonic-${mnemonic.id}`} className="text-sm font-medium text-muted-foreground">
          {mnemonic.target}
        </h3>
        <p className={cn("whitespace-pre-wrap break-words", mnemonic.kind === "acronym" ? "text-xl font-semibold tracking-wider" : "text-[15px] font-medium")}>{mnemonic.content}</p>
        {mnemonic.explanation && <p className="text-sm text-muted-foreground">{mnemonic.explanation}</p>}
      </div>
      {mnemonic.items.length > 0 && (
        <ol aria-label="What it stands for" className="list-decimal space-y-0.5 pl-5 text-sm">
          {mnemonic.items.map((entry, position) => (
            <li key={`${position}-${entry}`}>{entry}</li>
          ))}
        </ol>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="min-w-0">
          {mnemonic.material ? (
            <Link href={`${routes.materials}/${mnemonic.material.id}`} className="font-medium text-foreground hover:underline">
              {mnemonic.material.title}
            </Link>
          ) : (
            "No material"
          )}{" "}
          · {mnemonic.practicedLabel}
        </span>
        <ConfirmDialog
          open={confirming}
          title="Delete this mnemonic?"
          description={`The mnemonic for “${mnemonic.target}” is removed from your memory aids.`}
          confirmLabel="Delete mnemonic"
          pending={pending}
          error={confirming ? error : null}
          onConfirm={() => run(() => deleteMnemonicAction({ id: mnemonic.id }))}
          onCancel={() => setConfirming(false)}
        />
        <span className="flex items-center gap-1">
          {mnemonic.material && mnemonic.items.length >= 2 && (
            <Link href={`${routes.study}?method=mnemonics&material=${mnemonic.material.id}`} className={buttonClasses({ size: "sm", variant: "ghost" })}>
              <Brain className="h-4 w-4" aria-hidden="true" />
              Practice
            </Link>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit the mnemonic for ${mnemonic.target}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete the mnemonic for ${mnemonic.target}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        </span>
      </div>
    </li>
  );
}

/** The student's saved mnemonics: add, edit, favorite, delete, and practice the ones with a list. */
export function MnemonicLibrary({ mnemonics, materials, favoritesOnly }: { mnemonics: LibraryMnemonic[]; materials: Array<{ id: string; title: string }>; favoritesOnly: boolean }) {
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);

  return (
    <section aria-labelledby="mnemonics-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mnemonics-heading" className="text-lg font-semibold">
          Mnemonics
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex rounded-lg border border-border p-0.5 text-sm" aria-label="Which mnemonics">
            <Link href={routes.memoryAids} className={cn("rounded-md px-3 py-1.5", !favoritesOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} aria-current={!favoritesOnly ? "page" : undefined}>
              All
            </Link>
            <Link href={`${routes.memoryAids}?view=favorites`} className={cn("rounded-md px-3 py-1.5", favoritesOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} aria-current={favoritesOnly ? "page" : undefined}>
              Favorites
            </Link>
          </nav>
          <Button type="button" size="sm" onClick={() => setEditing({ id: null, form: EMPTY_FORM })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a mnemonic
          </Button>
        </div>
      </div>

      {mnemonics.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={favoritesOnly ? "No favorite mnemonics yet" : "No saved mnemonics yet"}
          description={favoritesOnly ? "Star the mnemonics that work best for you and they appear here." : "Save the devices that work for you during a Mnemonics session, or add your own."}
          action={
            !favoritesOnly ? (
              <Link href={`${routes.study}?method=mnemonics`} className={buttonClasses({ size: "sm" })}>
                Start a Mnemonics session
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mnemonics.map((mnemonic) => (
            <MnemonicCard key={mnemonic.id} mnemonic={mnemonic} onEdit={() => setEditing({ id: mnemonic.id, form: formOf(mnemonic) })} />
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit mnemonic" : "Add a mnemonic"} description="Keep every fact accurate — the device only helps you find it.">
        {editing && <MnemonicForm key={editing.id ?? "new"} initial={editing.form} materials={materials} editingId={editing.id} onDone={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

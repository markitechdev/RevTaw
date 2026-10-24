"use client";

import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteDeckAction, renameDeckAction } from "@/lib/flashcards/actions";
import { routes } from "@/lib/routes";
import type { GenerationStatus } from "@/lib/supabase/database.types";

export function DeckActions({ deckId, title, status }: { deckId: string; title: string; status: GenerationStatus }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rename = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameDeckAction(deckId, draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDialog(null);
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteDeckAction(deckId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`${routes.flashcards}?notice=deleted`);
    });
  };

  const retry = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/flashcards/${deckId}/retry`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: "{}" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The deck could not be regenerated.");
        // 409: it finished (or is still running) since this page loaded; show where it is now.
        if (response.status === 409) router.refresh();
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => { setDraft(title); setError(null); setDialog("rename"); }}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Rename
        </Button>
        {status === "failed" && (
          <Button type="button" variant="secondary" size="sm" loading={pending && dialog === null} onClick={retry}>
            {!pending && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Try again
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => { setError(null); setDialog("delete"); }}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>
      {error && dialog === null && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Dialog open={dialog === "rename"} onClose={() => !pending && setDialog(null)} title="Rename deck" dismissible={!pending}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            rename();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field id="deck-title" label="Title" required>
            <Input {...fieldA11y("deck-title")} value={draft} maxLength={160} onChange={(event) => setDraft(event.target.value)} autoFocus required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "delete"} onClose={() => !pending && setDialog(null)} title="Delete this deck?" dismissible={!pending}>
        <div className="flex flex-col gap-4">
          <Alert tone="error">“{title}”, its cards and their review history will be deleted permanently.</Alert>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={pending} onClick={remove}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

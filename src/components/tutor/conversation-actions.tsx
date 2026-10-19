"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { deleteConversationAction, renameConversationAction } from "@/lib/tutor/actions";

export function ConversationActions({ conversationId, title }: { conversationId: string; title: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rename = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameConversationAction(conversationId, draft);
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
      const result = await deleteConversationAction(conversationId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`${routes.tutor}?notice=deleted`);
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(title); setError(null); setDialog("rename"); }}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Rename
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => { setError(null); setDialog("delete"); }}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>
      <Dialog open={dialog === "rename"} onClose={() => !pending && setDialog(null)} title="Rename conversation" dismissible={!pending}>
        <form className="flex flex-col gap-4" noValidate onSubmit={(event) => { event.preventDefault(); rename(); }}>
          {error && <Alert tone="error">{error}</Alert>}
          <Field id="conversation-title" label="Title" required>
            <Input {...fieldA11y("conversation-title")} value={draft} maxLength={160} onChange={(event) => setDraft(event.target.value)} autoFocus required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" loading={pending}>Save</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={dialog === "delete"} onClose={() => !pending && setDialog(null)} title="Delete this conversation?" dismissible={!pending}>
        <div className="flex flex-col gap-4">
          <Alert tone="error">“{title}” and all of its messages will be deleted permanently. Notes and flashcards you saved from it are kept.</Alert>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" variant="danger" loading={pending} onClick={remove}>Delete permanently</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

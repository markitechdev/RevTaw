"use client";

import { CircleStop, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import type { ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DIALOG_ACTIONS } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { UnfinishedSessionView } from "@/lib/study/unfinished";

/**
 * The rename, end and delete dialogs for an unfinished session, and the ⋯ menu that opens them: shared by
 * Study's "Continue where you left off" and Home, so a session's actions read the same wherever it is. What
 * each confirmation says depends on the kind of session (what goes, what stays, and where).
 */

export type SessionDialogKind = "rename" | "end" | "delete";
export type SessionTarget = Pick<UnfinishedSessionView, "id" | "title" | "kind" | "answered">;

/** The longest session name (the database's limit, in characters). */
const NAME_MAX = 160;
const NAME_HINT = `Up to ${NAME_MAX} characters.`;

/** The ⋯ menu of an unfinished session; `first` adds actions of the place it is shown in (Home's "Open material"). */
export function sessionMenuItems(open: (kind: SessionDialogKind) => void, first: ActionMenuItem[] = []): ActionMenuItem[] {
  return [
    ...first,
    { key: "rename", label: "Rename", icon: Pencil, onSelect: () => open("rename") },
    { key: "end", label: "End session", icon: CircleStop, onSelect: () => open("end") },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => open("delete"), danger: true },
  ];
}

function endDetail(session: SessionTarget): string {
  switch (session.kind) {
    case "plan":
      return "Its unfinished blocks end too. What you answered in them stays and counts.";
    case "tutor":
      return "Tamari won't grade the conversation. It stays in Ask Tamari.";
    case "test":
      return "A practice test you haven't submitted gets no score. It stays in Quizzes, so you can still finish it there.";
    case "review":
      return "The cards you rated keep their new schedule.";
    case "timer":
      return "The focus time it saved is kept.";
    case "items":
      if (session.answered === 0) return "Nothing was answered yet, so its summary will be empty.";
      return session.answered === 1 ? "Your answer stays and counts toward your progress." : `Your ${session.answered} answers stay and count toward your progress.`;
  }
}

function deleteDetail(session: SessionTarget): string {
  switch (session.kind) {
    case "plan":
      return "Its unfinished blocks are deleted with it. Blocks you finished stay under Recent sessions.";
    case "tutor":
      return "The conversation stays in Ask Tamari.";
    case "test":
      return "The practice test and anything you answered in it stay in Quizzes.";
    case "review":
      return "Your card ratings stay, so your review schedule doesn't change.";
    case "timer":
      return "The focus time it saved is deleted too.";
    case "items":
      if (session.answered === 0) return "Nothing was answered in it yet.";
      return `${session.answered === 1 ? "Your answer in it is deleted too and no longer counts" : `Your ${session.answered} answers in it are deleted too and no longer count`} toward your progress. Mistakes it added stay in your mistake notebook.`;
  }
}

/**
 * The session's name, shown in a confirmation: two lines at most, long words broken so they never widen the
 * dialog. The box has the padding and the text the clamp, so no sliver of a third line shows in the padding.
 */
function NameBox({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
      <p className="line-clamp-2 text-sm font-medium wrap-anywhere">{title}</p>
    </div>
  );
}

export function EndSessionDialog({ session, pending = false, error = null, onConfirm, onCancel }: { session: SessionTarget | null; pending?: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      open={session !== null}
      title="End this session?"
      description="It moves to Recent sessions as stopped and can't be continued after that."
      confirmLabel="End session"
      tone="primary"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {session && (
        <div className="flex flex-col gap-2">
          <NameBox title={session.title} />
          <p className="text-sm text-muted-foreground">{endDetail(session)}</p>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function DeleteSessionDialog({ session, pending = false, error = null, onConfirm, onCancel }: { session: SessionTarget | null; pending?: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      open={session !== null}
      title="Delete this session?"
      description="This action cannot be undone."
      confirmLabel="Delete"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {session && (
        <div className="flex flex-col gap-2">
          <NameBox title={session.title} />
          <p className="text-sm text-muted-foreground">{deleteDetail(session)}</p>
        </div>
      )}
    </ConfirmDialog>
  );
}

/** Checks a new name the way the server does: spaces collapsed, not empty, at most 160 characters. */
export function sessionNameProblem(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return "Give the session a name.";
  if (Array.from(clean).length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters or fewer.`;
  return null;
}

export function RenameSessionDialog({ session, pending = false, error = null, onSave, onCancel }: { session: SessionTarget | null; pending?: boolean; error?: string | null; onSave: (title: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(session?.title ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  // A new session to rename starts from its own name.
  const [forId, setForId] = useState(session?.id ?? null);
  if ((session?.id ?? null) !== forId) {
    setForId(session?.id ?? null);
    setDraft(session?.title ?? "");
    setProblem(null);
  }
  const shownError = problem ?? error;

  return (
    <Dialog open={session !== null} onClose={() => !pending && onCancel()} dismissible={!pending} title="Rename session" className="max-w-120">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const found = sessionNameProblem(draft);
          setProblem(found);
          if (!found) onSave(draft.replace(/\s+/g, " ").trim());
        }}
      >
        <Field id="session-name" label="Session name" required error={shownError ?? undefined} hint={NAME_HINT}>
          <Input
            {...fieldA11y("session-name", shownError ?? undefined, NAME_HINT)}
            value={draft}
            maxLength={NAME_MAX}
            autoFocus
            required
            disabled={pending}
            onChange={(event) => {
              setDraft(event.target.value);
              if (problem) setProblem(null);
            }}
          />
        </Field>
        <div className={DIALOG_ACTIONS}>
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

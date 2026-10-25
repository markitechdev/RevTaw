"use client";

import { CheckCircle2, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { DeleteSessionDialog, EndSessionDialog, RenameSessionDialog, sessionMenuItems, type SessionDialogKind } from "@/components/study/session-dialogs";
import { ActionMenu } from "@/components/ui/action-menu";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useFocusAfterClose } from "@/components/ui/dialog";
import { TINT } from "@/components/ui/tint";
import { deleteSessionAction, endSessionAction, renameSessionAction } from "@/lib/study/session-actions";
import { UNFINISHED_SESSIONS_ID } from "@/lib/study/session-duplicate";
import type { UnfinishedSessionView } from "@/lib/study/unfinished";

type Change = { type: "remove"; id: string };

/** How long a "Session deleted." note stays before it clears itself. */
const NOTE_MS = 8000;

const menuId = (sessionId: string) => `session-menu-${sessionId}`;
const continueId = (sessionId: string) => `session-continue-${sessionId}`;

/**
 * Study's "Continue where you left off": every unfinished session, one row each, laid out the same way on
 * every screen. A row is the session's name (two lines at most) and what it is, then its buttons: Continue,
 * and ⋯ with Rename, End session and Delete. On phones the buttons sit under the name, Continue across the
 * row and ⋯ beside it, both 44 px tall; from `sm` up they sit at the row's end, the same width in every row.
 *
 * Ending or deleting takes the row away at once and the server catches up; if it fails, the row comes back
 * with the reason. The focus moves to the next row's Continue (or the heading when none is left), a status
 * line says what happened, and when the last session goes the card says so instead of disappearing.
 */
export function UnfinishedSessions({ sessions }: { sessions: UnfinishedSessionView[] }) {
  const [shown, change] = useOptimistic(sessions, (state: UnfinishedSessionView[], action: Change) => state.filter((session) => session.id !== action.id));
  const [, startRemoval] = useTransition();
  const [renaming, startRename] = useTransition();
  const [dialog, setDialog] = useState<{ kind: SessionDialogKind; session: UnfinishedSessionView } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown while there is something to continue; once it held sessions, it stays to say the list is empty.
  const [hadSessions] = useState(sessions.length > 0);
  // After a dialog, the focus goes back to the row's ⋯ (the menu item that opened it is gone), or to the next row.
  const focusAfterClose = useFocusAfterClose(dialog !== null);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  if (shown.length === 0 && !hadSessions) return null;


  const open = (kind: SessionDialogKind, session: UnfinishedSessionView) => {
    setError(null);
    setRenameError(null);
    setDialog({ kind, session });
  };

  const close = () => {
    if (dialog) focusAfterClose(menuId(dialog.session.id));
    setDialog(null);
  };

  const remove = (kind: "end" | "delete", session: UnfinishedSessionView) => {
    const index = shown.findIndex((item) => item.id === session.id);
    const next = shown[index + 1] ?? shown[index - 1] ?? null;
    focusAfterClose(next ? continueId(next.id) : UNFINISHED_SESSIONS_ID);
    setDialog(null);
    setError(null);
    setNote(null);
    startRemoval(async () => {
      change({ type: "remove", id: session.id });
      try {
        const result = kind === "delete" ? await deleteSessionAction(session.id) : await endSessionAction(session.id);
        if (!result.ok) setError(result.message);
        else setNote(kind === "delete" ? "Session deleted." : "Session ended. It's under Recent sessions now.");
      } catch {
        setError(kind === "delete" ? "We couldn't delete this session. Please try again." : "We couldn't end this session. Please try again.");
      }
    });
  };

  const rename = (session: UnfinishedSessionView, title: string) => {
    setRenameError(null);
    startRename(async () => {
      try {
        const result = await renameSessionAction({ sessionId: session.id, title });
        if (!result.ok) {
          setRenameError(result.message);
          return;
        }
        focusAfterClose(menuId(session.id));
        setDialog(null);
        setNote("Session renamed.");
      } catch {
        setRenameError("We couldn't rename this session. Please try again.");
      }
    });
  };

  const count = shown.length;

  return (
    <Card className={TINT.primary}>
      <CardHeader>
        <CardTitle id={UNFINISHED_SESSIONS_ID} tabIndex={-1} className="scroll-mt-24">
          Continue where you left off
        </CardTitle>
        <CardDescription>{count === 0 ? "Nothing unfinished right now." : count === 1 ? "1 session in progress keeps its place." : `${count} sessions in progress keep their place.`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        {/* Always on the page, so the change is announced; the note under it is what sighted students see. */}
        <p role="status" className="sr-only">
          {note}
        </p>
        {note && (
          <p aria-hidden="true" className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {note}
          </p>
        )}
        {count === 0 ? (
          <EmptyState compact icon={CheckCircle2} title="You're all caught up" description="A session you leave midway waits here until you continue, end or delete it." className="bg-card" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {shown.map((session) => (
              <li key={session.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-foreground wrap-anywhere">{session.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{session.meta}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Link
                      id={continueId(session.id)}
                      href={session.href}
                      className={buttonClasses({ size: "sm", className: "flex-1 max-sm:h-11 sm:w-28 sm:flex-none" })}
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Continue
                      <span className="sr-only"> {session.title}</span>
                    </Link>
                    <ActionMenu label={`More actions for ${session.title}`} items={sessionMenuItems((kind) => open(kind, session))} triggerId={menuId(session.id)} triggerClassName="max-sm:h-11 max-sm:w-11" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <RenameSessionDialog session={dialog?.kind === "rename" ? dialog.session : null} pending={renaming} error={renameError} onSave={(title) => dialog && rename(dialog.session, title)} onCancel={close} />
      <EndSessionDialog session={dialog?.kind === "end" ? dialog.session : null} onConfirm={() => dialog && remove("end", dialog.session)} onCancel={close} />
      <DeleteSessionDialog session={dialog?.kind === "delete" ? dialog.session : null} onConfirm={() => dialog && remove("delete", dialog.session)} onCancel={close} />
    </Card>
  );
}

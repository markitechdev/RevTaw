"use client";

import { BookOpen, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

import { DeleteSessionDialog, EndSessionDialog, RenameSessionDialog, sessionMenuItems, type SessionDialogKind, type SessionTarget } from "@/components/study/session-dialogs";
import { ActionMenu } from "@/components/ui/action-menu";
import { useFocusAfterClose } from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { deleteSessionAction, endSessionAction, renameSessionAction } from "@/lib/study/session-actions";

/**
 * Home's hero, when what to continue is an unfinished session: Continue and the same ⋯ menu as Study's list
 * (Rename, End session, Delete), with Open material first. Ending or deleting hides the session at once while the server catches up (`HeroSession`),
 * then Home shows what comes next with a note; if it fails, the session comes back with the reason.
 */

type Removal = { removed: boolean; hide: () => void; restore: (error: string) => void; error: string | null };

const RemovalContext = createContext<Removal | null>(null);

/** Wraps the hero's contents so the menu inside can take them away (and bring them back). */
export function HeroSession({ title, children }: { title: string; children: ReactNode }) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value: Removal = {
    removed,
    error,
    hide: () => {
      setError(null);
      setRemoved(true);
    },
    restore: (message) => {
      setRemoved(false);
      setError(message);
    },
  };
  return (
    <RemovalContext.Provider value={value}>
      {/* Kept on the page while hidden, so its menu can bring it back. */}
      <div hidden={removed} className="contents">
        {children}
      </div>
      {removed && (
        <p role="status" className="flex h-full min-h-32 items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground sm:p-5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <span className="min-w-0 wrap-anywhere">Taking “{title}” off Home…</span>
        </p>
      )}
    </RemovalContext.Provider>
  );
}

/** The hero's error, under its buttons, after a failed end or delete. */
export function HeroSessionError() {
  const error = useContext(RemovalContext)?.error;
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  );
}

export function ContinueSessionActions({ session, materialHref = null }: { session: SessionTarget; materialHref?: string | null }) {
  const router = useRouter();
  const removal = useContext(RemovalContext);
  const [dialog, setDialog] = useState<SessionDialogKind | null>(null);
  const [renaming, startRename] = useTransition();
  const [, startRemoval] = useTransition();
  const [renameError, setRenameError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const triggerId = `home-session-menu-${session.id}`;
  // After a dialog (or a failed end or delete), the focus goes back to ⋯: the menu item that opened it is gone.
  const focusAfterClose = useFocusAfterClose(dialog !== null);
  const focusMenu = () => focusAfterClose(triggerId);

  const close = () => {
    focusMenu();
    setDialog(null);
  };

  const remove = (kind: "end" | "delete") => {
    setDialog(null);
    setNote(null);
    removal?.hide();
    startRemoval(async () => {
      const failed = kind === "delete" ? "We couldn't delete this session. Please try again." : "We couldn't end this session. Please try again.";
      try {
        const result = kind === "delete" ? await deleteSessionAction(session.id) : await endSessionAction(session.id);
        if (!result.ok) {
          focusMenu();
          removal?.restore(result.message);
          return;
        }
        router.replace(`${routes.dashboard}?notice=${kind === "delete" ? "session-deleted" : "session-ended"}`, { scroll: false });
      } catch {
        focusMenu();
        removal?.restore(failed);
      }
    });
  };

  const rename = (title: string) => {
    setRenameError(null);
    startRename(async () => {
      try {
        const result = await renameSessionAction({ sessionId: session.id, title });
        if (!result.ok) {
          setRenameError(result.message);
          return;
        }
        focusMenu();
        setDialog(null);
        setNote("Session renamed.");
      } catch {
        setRenameError("We couldn't rename this session. Please try again.");
      }
    });
  };

  return (
    <>
      <ActionMenu
        label={`More actions for ${session.title}`}
        items={sessionMenuItems(
          (kind) => {
            setRenameError(null);
            setDialog(kind);
          },
          materialHref ? [{ key: "material", label: "Open material", icon: BookOpen, onSelect: () => router.push(materialHref) }] : [],
        )}
        triggerId={triggerId}
        className="flex-none"
        triggerClassName="h-11 w-11 @2xl:h-12 @2xl:w-12"
      />
      <p role="status" className="sr-only">
        {note}
      </p>
      <RenameSessionDialog session={dialog === "rename" ? session : null} pending={renaming} error={renameError} onSave={rename} onCancel={close} />
      <EndSessionDialog session={dialog === "end" ? session : null} onConfirm={() => remove("end")} onCancel={close} />
      <DeleteSessionDialog session={dialog === "delete" ? session : null} onConfirm={() => remove("delete")} onCancel={close} />
    </>
  );
}

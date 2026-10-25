"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatRelativeDate } from "@/components/materials/material-card";
import { Button } from "@/components/ui/button";
import { Dialog, DIALOG_ACTIONS } from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { UNFINISHED_SESSIONS_HREF, UNFINISHED_SESSIONS_ID, type SessionDuplicate } from "@/lib/study/session-duplicate";

/**
 * Shown instead of starting a session when the student already has an unfinished one like it (the server's
 * answer, duplicates.ts). One copy: resume it, start a new one anyway, or cancel. Several: the warning says
 * how many and offers the list, where extra copies can be ended or deleted. At the limit only the list and
 * Cancel are left. Resuming or opening the list keeps the buttons busy until the page changes, so a second
 * tap does nothing; "Start a new one" calls `onStartNew`, which asks the server again with permission.
 */
export function DuplicateSessionDialog({
  duplicate,
  starting = false,
  onStartNew,
  onCancel,
  onLeave,
}: {
  duplicate: SessionDuplicate | null;
  /** The new copy is being started (after "Start a new one"). */
  starting?: boolean;
  onStartNew: () => void;
  onCancel: () => void;
  /** The student is being taken to the unfinished session or the list (the page is about to change). */
  onLeave?: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<"resume" | "list" | null>(null);
  const busy = starting || leaving !== null;

  // Reset once the dialog is gone (the page changed, or the student came back to this one).
  const [shown, setShown] = useState<SessionDuplicate | null>(duplicate);
  if (duplicate !== shown) {
    setShown(duplicate);
    setLeaving(null);
  }

  const resume = (href: string) => {
    setLeaving("resume");
    onLeave?.();
    router.push(href);
  };

  // On Study itself the list is already on the page: close and go to it.
  const openList = () => {
    if (window.location.pathname === routes.study) {
      onCancel();
      window.requestAnimationFrame(() => document.getElementById(UNFINISHED_SESSIONS_ID)?.focus());
      return;
    }
    setLeaving("list");
    onLeave?.();
    router.push(UNFINISHED_SESSIONS_HREF);
  };

  const item = duplicate?.existingItem;
  const count = duplicate?.duplicateCount ?? 0;
  const level = duplicate?.level ?? "warning";
  const title =
    level === "warning" ? "You already have this session in progress" : level === "strong" ? `You already have ${count} unfinished copies of this session` : `You have ${count} unfinished copies of this session`;

  return (
    <Dialog open={duplicate !== null} onClose={() => !busy && onCancel()} dismissible={!busy} title={title} className="max-w-120">
      {item && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
            <p className="line-clamp-2 text-sm font-medium wrap-anywhere">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {level === "warning" ? "Started" : "Last one started"} {formatRelativeDate(item.startedAt)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {level === "warning"
              ? "Pick up where you left off, or start a new one. Starting a new one keeps this one unfinished."
              : level === "strong"
                ? "Resume one of them, or end or delete the extra copies, before you start another."
                : "Finish, end or delete one of them before you start another. You can do that from Continue where you left off."}
          </p>
          <div className={DIALOG_ACTIONS}>
            <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            {level !== "limit" && (
              <Button type="button" variant="secondary" loading={starting} disabled={busy && !starting} onClick={onStartNew}>
                {level === "warning" ? "Start a new one" : "Start another copy"}
              </Button>
            )}
            {level === "warning" ? (
              <Button type="button" loading={leaving === "resume"} disabled={busy && leaving !== "resume"} onClick={() => resume(item.href)}>
                Resume it
              </Button>
            ) : (
              <Button type="button" loading={leaving === "list"} disabled={busy && leaving !== "list"} onClick={openList}>
                See unfinished sessions
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

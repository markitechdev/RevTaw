"use client";

import { FolderInput, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { PurgeMaterialButton, RestoreMaterialButton } from "@/components/materials/archive-controls";
import {
  NEW_SUBJECT,
  PlacementFields,
  placementPayload,
  type PlacementValue,
} from "@/components/materials/placement-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MATERIAL_TITLE_MAX } from "@/lib/materials/constants";
import {
  moveMaterialAction,
  renameMaterialAction,
  setMaterialArchivedAction,
  type OrganizeResult,
} from "@/lib/materials/organize-actions";
import type { SubjectWithFolders } from "@/lib/materials/queries";
import { ARCHIVE_DAYS, KEPT_ITEMS } from "@/lib/materials/retention";
import { routes } from "@/lib/routes";

type DialogKind = "rename" | "move" | "delete" | null;

/**
 * Rename, Move and the Archive: Delete moves the material to the Archive
 * (restorable for 30 days); an archived one can be restored or deleted
 * permanently; once its file is gone only Rename and Move remain, to keep
 * what was made from it organized.
 */
export function MaterialActions({
  materialId,
  title,
  subjectId,
  folderId,
  filedUnder,
  state,
  subjects,
}: {
  materialId: string;
  title: string;
  subjectId: string | null;
  folderId: string | null;
  /** "General Biology · Cells", for the dialogs. */
  filedUnder: string | null;
  state: "active" | "archived" | "deleted";
  subjects: SubjectWithFolders[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nextTitle, setNextTitle] = useState(title);
  const [placement, setPlacement] = useState<PlacementValue>({
    subjectId: subjectId ?? "",
    folderId: folderId ?? "",
    newSubjectName: "",
  });
  const [newFolderName, setNewFolderName] = useState("");

  const open = (kind: DialogKind) => {
    setError(null);
    setFieldErrors({});
    setNextTitle(title);
    setPlacement({ subjectId: subjectId ?? "", folderId: folderId ?? "", newSubjectName: "" });
    setNewFolderName("");
    setDialog(kind);
  };
  const close = () => {
    if (!pending) setDialog(null);
  };

  const handle = (run: () => Promise<OrganizeResult>, after?: () => void) => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setDialog(null);
      if (after) after();
      else router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Material actions">
        <Button type="button" variant="secondary" size="sm" onClick={() => open("rename")}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Rename
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => open("move")}>
          <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
          Move
        </Button>
        {state === "active" && (
          <Button type="button" variant="danger-ghost" size="sm" onClick={() => open("delete")}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        )}
        {state === "archived" && (
          <>
            <RestoreMaterialButton materialId={materialId} />
            <PurgeMaterialButton materialId={materialId} title={title} placement={filedUnder} />
          </>
        )}
      </div>
      {error && dialog === null && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Dialog open={dialog === "rename"} onClose={close} title="Rename material" dismissible={!pending}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handle(() => renameMaterialAction(materialId, nextTitle));
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field id="rename-title" label="Title" error={fieldErrors.title} required>
            <Input
              {...fieldA11y("rename-title", fieldErrors.title)}
              value={nextTitle}
              maxLength={MATERIAL_TITLE_MAX}
              onChange={(event) => setNextTitle(event.target.value)}
              autoFocus
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "move"} onClose={close} title="Move material" description="Choose a subject and, optionally, a folder." dismissible={!pending}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const payload = placementPayload(placement);
            handle(() =>
              moveMaterialAction({
                materialId,
                subjectId: payload.subjectId,
                folderId: payload.folderId,
                newSubjectName: payload.newSubjectName,
                newFolderName,
              }),
            );
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <PlacementFields subjects={subjects} value={placement} onChange={setPlacement} errors={fieldErrors} idPrefix="move" disabled={pending} />
          {placement.subjectId && placement.subjectId !== NEW_SUBJECT && (
            <Field id="move-new-folder" label="Or create a new folder in this subject" error={fieldErrors.newFolderName} hint="Optional, e.g. Chapter 3 — Stacks">
              <Input
                {...fieldA11y("move-new-folder", fieldErrors.newFolderName, true)}
                value={newFolderName}
                maxLength={80}
                disabled={pending}
                onChange={(event) => setNewFolderName(event.target.value)}
              />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Move
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this material?"
        confirmLabel="Move to Archive"
        pending={pending}
        error={dialog === "delete" ? error : null}
        onCancel={close}
        onConfirm={() =>
          handle(
            () => setMaterialArchivedAction(materialId, true),
            () => router.push(`${routes.materials}?notice=archived&material=${materialId}`),
          )
        }
      >
        <p className="text-sm">
          “{title}” moves to the Archive. You can restore it there for {ARCHIVE_DAYS} days; after that, its file, extracted text and
          analysis are deleted permanently.
        </p>
        <p className="text-sm text-muted-foreground">
          {KEPT_ITEMS} made from it always stay{filedUnder ? `, filed under ${filedUnder}` : ""}.
        </p>
      </ConfirmDialog>
    </>
  );
}

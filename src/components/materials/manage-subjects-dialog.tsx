"use client";

import { Check, FolderPlus, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createFolderAction,
  createSubjectAction,
  deleteFolderAction,
  deleteSubjectAction,
  renameFolderAction,
  renameSubjectAction,
  type OrganizeResult,
} from "@/lib/materials/organize-actions";
import type { SubjectWithFolders } from "@/lib/materials/queries";

/** Create, rename and delete subjects and folders from the materials page. */
export function ManageSubjectsButton({ subjects }: { subjects: SubjectWithFolders[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        Manage
      </Button>
      <ManageSubjectsDialog open={open} onClose={() => setOpen(false)} subjects={subjects} />
    </>
  );
}

function ManageSubjectsDialog({
  open,
  onClose,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  subjects: SubjectWithFolders[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [editing, setEditing] = useState<{ kind: "subject" | "folder"; id: string; value: string } | null>(null);
  const [newFolder, setNewFolder] = useState<{ subjectId: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "subject" | "folder"; id: string; name: string } | null>(null);

  const run = (action: () => Promise<OrganizeResult>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      after?.();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Subjects and folders" description="Materials in a deleted subject or folder are kept and become unfiled." dismissible={!pending}>
      <div className="flex flex-col gap-5">
        {error && <Alert tone="error">{error}</Alert>}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createSubjectAction(newSubject), () => setNewSubject(""));
          }}
        >
          <label htmlFor="new-subject" className="sr-only">
            New subject name
          </label>
          <Input
            id="new-subject"
            value={newSubject}
            maxLength={80}
            placeholder="New subject, e.g. Organic Chemistry"
            onChange={(event) => setNewSubject(event.target.value)}
            disabled={pending}
          />
          <Button type="submit" loading={pending} disabled={!newSubject.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </form>

        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects yet. Add one above, or create one while uploading.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {subjects.map((subject) => (
              <li key={subject.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  {editing?.kind === "subject" && editing.id === subject.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(() => renameSubjectAction(subject.id, editing.value), () => setEditing(null));
                      }}
                    >
                      <Input
                        aria-label={`Rename ${subject.name}`}
                        value={editing.value}
                        maxLength={80}
                        autoFocus
                        onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                      />
                      <Button type="submit" size="icon" aria-label="Save name" loading={pending}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p className="flex-1 truncate font-medium">
                        {subject.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {subject.materialCount} material{subject.materialCount === 1 ? "" : "s"}
                        </span>
                      </p>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Rename ${subject.name}`} onClick={() => setEditing({ kind: "subject", id: subject.id, value: subject.name })}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Add folder to ${subject.name}`} onClick={() => setNewFolder({ subjectId: subject.id, value: "" })}>
                        <FolderPlus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon" variant="danger-ghost" aria-label={`Delete ${subject.name}`} onClick={() => setConfirmDelete({ kind: "subject", id: subject.id, name: subject.name })}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>

                {(subject.folders.length > 0 || newFolder?.subjectId === subject.id) && (
                  <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-3">
                    {subject.folders.map((folder) => (
                      <li key={folder.id} className="flex items-center gap-2 text-sm">
                        {editing?.kind === "folder" && editing.id === folder.id ? (
                          <form
                            className="flex flex-1 gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              run(() => renameFolderAction(folder.id, editing.value), () => setEditing(null));
                            }}
                          >
                            <Input aria-label={`Rename ${folder.name}`} value={editing.value} maxLength={80} autoFocus onChange={(event) => setEditing({ ...editing, value: event.target.value })} className="h-9" />
                            <Button type="submit" size="icon-sm" aria-label="Save name" loading={pending}>
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </form>
                        ) : (
                          <>
                            <span className="flex-1 truncate">{folder.name}</span>
                            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Rename ${folder.name}`} onClick={() => setEditing({ kind: "folder", id: folder.id, value: folder.name })}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button type="button" size="icon-sm" variant="danger-ghost" aria-label={`Delete ${folder.name}`} onClick={() => setConfirmDelete({ kind: "folder", id: folder.id, name: folder.name })}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                    {newFolder?.subjectId === subject.id && (
                      <li>
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            run(() => createFolderAction(subject.id, newFolder.value), () => setNewFolder(null));
                          }}
                        >
                          <Input aria-label="New folder name" value={newFolder.value} maxLength={80} placeholder="Folder name, e.g. Chapter 1" autoFocus onChange={(event) => setNewFolder({ ...newFolder, value: event.target.value })} className="h-9" />
                          <Button type="submit" size="sm" loading={pending} disabled={!newFolder.value.trim()}>
                            Add
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setNewFolder(null)}>
                            Cancel
                          </Button>
                        </form>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {confirmDelete && (
          <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft/60 p-3" role="alertdialog" aria-label="Confirm deletion">
            <p className="text-sm">
              Delete {confirmDelete.kind} <span className="font-medium">“{confirmDelete.name}”</span>? Materials inside it are kept.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={pending}
                onClick={() =>
                  run(
                    () => (confirmDelete.kind === "subject" ? deleteSubjectAction(confirmDelete.id) : deleteFolderAction(confirmDelete.id)),
                    () => setConfirmDelete(null),
                  )
                }
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

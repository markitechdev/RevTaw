"use client";

import { FileText, Upload, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useRef, useState, type DragEvent } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert, FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_PLACEMENT,
  PlacementFields,
  placementPayload,
  type PlacementValue,
} from "@/components/materials/placement-fields";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { IDLE_STATE, type ActionState } from "@/lib/forms/action-state";
import { createFileMaterialAction, createTextMaterialAction, discardUploadAction } from "@/lib/materials/actions";
import {
  ACCEPT_ATTRIBUTE,
  acceptedTypeFor,
  formatBytes,
  MATERIAL_TITLE_MAX,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
} from "@/lib/materials/constants";
import type { SubjectWithFolders } from "@/lib/materials/queries";
import { requestProcessing, uploadFileToSignedUrl } from "@/lib/materials/upload-client";
import { cn } from "@/lib/utils";

type Tab = "file" | "text";

export function UploadDialog({
  open,
  onClose,
  subjects,
  initialSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  subjects: SubjectWithFolders[];
  initialSubjectId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [busy, setBusy] = useState(false);
  const tabsId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Add study material"
      description={
        <>
          <span lang="fil">Bitaw mo na kay RevTaw.</span> Upload notes and we&apos;ll help turn them into something you can actually study.
        </>
      }
      className="max-w-xl"
    >
      <Segmented
        label="How to add it"
        name={`material-type-${tabsId}`}
        value={tab}
        onChange={setTab}
        fill
        disabled={busy}
        className="mb-4"
        options={[
          {
            value: "file",
            label: (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload a file
              </>
            ),
          },
          {
            value: "text",
            label: (
              <>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Paste notes
              </>
            ),
          },
        ]}
      />

      <div>
        {tab === "file" ? (
          <FileUploadPanel
            subjects={subjects}
            initialSubjectId={initialSubjectId}
            onBusyChange={setBusy}
            onDone={onClose}
          />
        ) : (
          <PasteNotesPanel subjects={subjects} initialSubjectId={initialSubjectId} onDone={onClose} />
        )}
      </div>
    </Dialog>
  );
}

type UploadPhase =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "uploading"; percent: number }
  | { kind: "processing" }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string> };

function FileUploadPanel({
  subjects,
  initialSubjectId,
  onBusyChange,
  onDone,
}: {
  subjects: SubjectWithFolders[];
  initialSubjectId?: string | null;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [placement, setPlacement] = useState<PlacementValue>({
    ...EMPTY_PLACEMENT,
    subjectId: initialSubjectId ?? "",
  });
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });

  const busy = phase.kind === "preparing" || phase.kind === "uploading" || phase.kind === "processing";
  const errors = phase.kind === "error" ? (phase.fieldErrors ?? {}) : {};

  const chooseFile = (candidate: File | null) => {
    if (!candidate) return;
    const accepted = acceptedTypeFor(candidate.name, candidate.type);
    if (!accepted) {
      setFile(null);
      setFileError("Use a PDF, Word document (DOC/DOCX), image (PNG, JPG, WebP, GIF) or text file.");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError(`Files must be 25 MB or smaller. This one is ${formatBytes(candidate.size)}.`);
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setFileError("That file is empty.");
      return;
    }
    setFileError(null);
    setFile(candidate);
    if (!titleTouched) {
      setTitle(candidate.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, MATERIAL_TITLE_MAX));
    }
    setPhase({ kind: "idle" });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  };

  const submit = async () => {
    if (!file) {
      setFileError("Choose a file to upload.");
      return;
    }
    onBusyChange(true);
    setPhase({ kind: "preparing" });

    const prepared = await createFileMaterialAction({
      title,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      ...placementPayload(placement),
    });

    if (!prepared.ok) {
      setPhase({ kind: "error", message: prepared.message, fieldErrors: prepared.fieldErrors });
      onBusyChange(false);
      return;
    }

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: "uploading", percent: 0 });
      await uploadFileToSignedUrl(
        prepared.uploadUrl,
        file,
        (progress) => setPhase({ kind: "uploading", percent: progress.percent }),
        controller.signal,
      );
      setPhase({ kind: "processing" });
      // Fire-and-forget: the list polls the material's status from here on.
      void requestProcessing(prepared.materialId);
      router.refresh();
      onBusyChange(false);
      onDone();
    } catch (error) {
      onBusyChange(false);
      // The row exists from step 1; without the file it would sit at "Uploading" forever.
      void discardUploadAction(prepared.materialId).then(() => router.refresh());
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase({ kind: "idle" });
        return;
      }
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "The upload failed. Please try again.",
      });
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {phase.kind === "error" && <Alert tone="error">{phase.message}</Alert>}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-border bg-muted/40",
          fileError && "border-danger/60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          id="material-file"
          disabled={busy}
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            {!busy && (
              <div className="mt-1 flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                  Choose another
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Drag and drop a file here</p>
            <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, PNG, JPG, WebP, GIF or TXT · up to 25 MB</p>
            <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        {fileError && (
          <p className="text-sm text-danger" role="alert">
            {fileError}
          </p>
        )}
      </div>

      <Field id="material-title" label="Title" error={errors.title} required>
        <Input
          {...fieldA11y("material-title", errors.title)}
          name="title"
          type="text"
          maxLength={MATERIAL_TITLE_MAX}
          value={title}
          disabled={busy}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleTouched(true);
          }}
          placeholder="e.g. Chapter 3 — Stacks and Queues"
          required
        />
      </Field>

      <PlacementFields
        subjects={subjects}
        value={placement}
        onChange={setPlacement}
        errors={errors}
        idPrefix="file-placement"
        disabled={busy}
      />

      {phase.kind === "uploading" && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Uploading…</span>
            <span className="text-muted-foreground">{phase.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${phase.percent}%` }} />
          </div>
        </div>
      )}
      {phase.kind === "preparing" && (
        <p className="text-sm text-muted-foreground" role="status">
          Preparing a private upload link…
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {phase.kind === "uploading" ? (
          <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
            Cancel upload
          </Button>
        ) : (
          <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy} disabled={!file || busy}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload
        </Button>
      </div>
    </form>
  );
}

function PasteNotesPanel({
  subjects,
  initialSubjectId,
  onDone,
}: {
  subjects: SubjectWithFolders[];
  initialSubjectId?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [placement, setPlacement] = useState<PlacementValue>({
    ...EMPTY_PLACEMENT,
    subjectId: initialSubjectId ?? "",
  });
  const [length, setLength] = useState(0);

  const [state, formAction] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createTextMaterialAction(previous, formData);
      const materialId = result.status === "success" ? result.values?.materialId : undefined;
      if (materialId) {
        void requestProcessing(materialId);
        router.refresh();
        onDone();
      }
      return result;
    },
    IDLE_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />

      <Field id="notes-title" label="Title" error={errors.title} required>
        <Input
          {...fieldA11y("notes-title", errors.title)}
          name="title"
          type="text"
          maxLength={MATERIAL_TITLE_MAX}
          defaultValue={state.values?.title ?? ""}
          placeholder="e.g. Photosynthesis — class notes"
          required
        />
      </Field>

      <Field
        id="notes-text"
        label="Notes"
        error={errors.text}
        hint={`${length.toLocaleString("en-US")} / ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters`}
        required
      >
        <Textarea
          {...fieldA11y("notes-text", errors.text, true)}
          name="text"
          rows={10}
          maxLength={MAX_TEXT_CHARS}
          defaultValue={state.values?.text ?? ""}
          onChange={(event) => setLength(event.target.value.length)}
          placeholder="Paste or type your notes. Headings on their own line help RevTaw find topics."
          required
        />
      </Field>

      <PlacementFields
        subjects={subjects}
        value={placement}
        onChange={setPlacement}
        errors={errors}
        idPrefix="notes-placement"
      />
      {/* Hidden mirrors so the server action receives the resolved placement. */}
      <input type="hidden" name="subjectId" value={placementPayload(placement).subjectId} />
      <input type="hidden" name="folderId" value={placementPayload(placement).folderId} />
      <input type="hidden" name="newSubjectName" value={placementPayload(placement).newSubjectName} />

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Save notes
        </SubmitButton>
      </div>
    </form>
  );
}

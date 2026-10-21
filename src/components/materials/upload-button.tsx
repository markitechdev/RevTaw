"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

import { UploadDialog } from "@/components/materials/upload-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { clearQueryParam } from "@/lib/hooks/query-param";
import type { SubjectWithFolders } from "@/lib/materials/queries";

/**
 * Opens the add-material dialog; used in the toolbar and in empty states.
 * `defaultOpen` opens it on arrival (links such as /materials?upload=1 from
 * the dashboard and the command menu); closing it drops the parameter so a
 * reload does not reopen it.
 */
export function UploadButton({
  subjects,
  initialSubjectId,
  defaultOpen = false,
  children = "Upload material",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & {
  subjects: SubjectWithFolders[];
  initialSubjectId?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Remount the dialog on every open so a previous upload's form state is gone.
  const [session, setSession] = useState(defaultOpen ? 1 : 0);

  const close = () => {
    setOpen(false);
    clearQueryParam("upload");
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setSession((value) => value + 1);
          setOpen(true);
        }}
        {...props}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <UploadDialog
        key={session}
        open={open}
        onClose={close}
        subjects={subjects}
        initialSubjectId={initialSubjectId}
      />
    </>
  );
}

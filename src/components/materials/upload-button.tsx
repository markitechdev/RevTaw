"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

import { UploadDialog } from "@/components/materials/upload-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { SubjectWithFolders } from "@/lib/materials/queries";

/** Opens the add-material dialog; used in the toolbar and in empty states. */
export function UploadButton({
  subjects,
  initialSubjectId,
  children = "Upload material",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & {
  subjects: SubjectWithFolders[];
  initialSubjectId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Remount the dialog on every open so a previous upload's form state is gone.
  const [session, setSession] = useState(0);

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
        onClose={() => setOpen(false)}
        subjects={subjects}
        initialSubjectId={initialSubjectId}
      />
    </>
  );
}

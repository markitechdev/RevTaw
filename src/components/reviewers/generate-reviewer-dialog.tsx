"use client";

import { NotebookPen, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useTamariActivity } from "@/components/assistant/assistant-provider";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { REVIEWER_KINDS } from "@/lib/reviewers/kinds";
import { routes } from "@/lib/routes";
import type { ReviewerKind } from "@/lib/supabase/database.types";

/** Starts generating a reviewer and opens it; shared by the material page dialog and the Reviewer tool. */
export function useCreateReviewer() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useTamariActivity("reviewer", pending);

  const create = (materialId: string, kind: ReviewerKind) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/reviewers", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ materialId, kind }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; status?: string; detail?: string | null; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The reviewer could not be created.");
        return;
      }
      router.push(`${routes.notes}/${body.id}`);
    });
  };

  return { create, error, pending };
}

/** The reviewer formats as radio cards (spec §21). */
export function ReviewerKindPicker({ value, onChange, disabled = false, legend = "Reviewer format", hideLegend = true }: { value: ReviewerKind; onChange: (kind: ReviewerKind) => void; disabled?: boolean; legend?: string; hideLegend?: boolean }) {
  return (
    <ChipGroup
      type="single"
      look="card"
      columns={2}
      name="reviewer-kind"
      legend={legend}
      hideLegend={hideLegend}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={REVIEWER_KINDS.map((item) => ({ value: item.id, label: item.name, hint: item.description }))}
    />
  );
}

export function GeneratingNote() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
      Generating reviewer… this usually takes under a minute.
    </p>
  );
}

/** Button + dialog to turn a processed material into a reviewer of a chosen kind. */
export function GenerateReviewerButton({
  materialId,
  disabled,
  children = "Create reviewer",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & { materialId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReviewerKind>("complete");
  const { create, error, pending } = useCreateReviewer();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled} {...props}>
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        dismissible={!pending}
        title="Create a reviewer"
        description="Pick a format. Every section stays editable and can be regenerated on its own."
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <ReviewerKindPicker value={kind} onChange={setKind} disabled={pending} />
          {pending && <GeneratingNote />}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={pending} onClick={() => create(materialId, kind)}>
              {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Generate
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

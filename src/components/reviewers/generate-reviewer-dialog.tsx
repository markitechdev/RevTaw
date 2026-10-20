"use client";

import { NotebookPen, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { REVIEWER_KINDS } from "@/lib/reviewers/kinds";
import { routes } from "@/lib/routes";
import type { ReviewerKind } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Starts generating a reviewer and opens it; shared by the material page dialog and the Reviewer tool. */
export function useCreateReviewer() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    <fieldset disabled={disabled}>
      <legend className={hideLegend ? "sr-only" : "mb-2 text-sm font-semibold text-foreground"}>{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {REVIEWER_KINDS.map((item) => (
          <label
            key={item.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors",
              "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
            )}
          >
            <input type="radio" name="reviewer-kind" value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-foreground">{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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

"use client";

import { Search, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { GeneratingNote, ReviewerKindPicker, useCreateReviewer } from "@/components/reviewers/generate-reviewer-dialog";
import { Button } from "@/components/ui/button";
import type { ReviewerKind } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type ReviewerMaterialOption = { id: string; title: string; subject: string | null; meta: string };

/**
 * The Reviewer tool (UI phase §12, Create): pick a ready material, pick a
 * format, generate. Two steps on one screen; a filter appears when the list
 * gets long.
 */
export function CreateReviewerForm({ materials, initialMaterialId }: { materials: ReviewerMaterialOption[]; initialMaterialId: string | null }) {
  const [materialId, setMaterialId] = useState(initialMaterialId && materials.some((item) => item.id === initialMaterialId) ? initialMaterialId : (materials[0]?.id ?? ""));
  const [kind, setKind] = useState<ReviewerKind>("complete");
  const [filter, setFilter] = useState("");
  const { create, error, pending } = useCreateReviewer();
  const filterId = useId();

  const needle = filter.trim().toLowerCase();
  const shown = needle ? materials.filter((item) => item.title.toLowerCase().includes(needle) || item.subject?.toLowerCase().includes(needle)) : materials;

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (materialId) create(materialId, kind);
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}

      <fieldset disabled={pending} className="flex flex-col gap-3">
        <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
          Material
        </legend>
        {materials.length > 6 && (
          <div className="relative max-w-sm">
            <label htmlFor={filterId} className="sr-only">
              Filter materials
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id={filterId}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by title or subject"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none"
            />
          </div>
        )}
        <div className="grid max-h-[22rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {shown.map((item) => (
            <label
              key={item.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors",
                "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              )}
            >
              <input type="radio" name="material" value={item.id} checked={materialId === item.id} onChange={() => setMaterialId(item.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{item.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.subject ?? "No subject"} · {item.meta}
                </span>
              </span>
            </label>
          ))}
          {shown.length === 0 && <p className="text-sm text-muted-foreground">No material matches “{filter}”.</p>}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground" aria-hidden="true">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
          Format
        </p>
        <ReviewerKindPicker value={kind} onChange={setKind} disabled={pending} legend="Format" />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        {pending ? <GeneratingNote /> : <p className="text-sm text-muted-foreground">Every section stays editable, and any one of them can be regenerated without touching the rest.</p>}
        <Button type="submit" loading={pending} disabled={!materialId} className="shrink-0">
          {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
          Create reviewer
        </Button>
      </div>
    </form>
  );
}

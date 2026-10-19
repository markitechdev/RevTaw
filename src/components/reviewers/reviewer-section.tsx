"use client";

import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Markdown } from "@/components/content/markdown";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { updateReviewerSectionAction } from "@/lib/reviewers/actions";
import { cn } from "@/lib/utils";

export type SectionData = {
  id: string;
  position: number;
  heading: string;
  content: string;
  edited_at: string | null;
  regenerated_at: string | null;
};

type Mode = "view" | "edit" | "regenerate";

/**
 * One reviewer section: rendered markdown with Edit (manual) and Regenerate
 * (AI, optionally with instructions) — both keep the other sections intact.
 */
export function ReviewerSectionView({ reviewerId, section }: { reviewerId: string; section: SectionData }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [heading, setHeading] = useState(section.heading);
  const [content, setContent] = useState(section.content);
  const [draftHeading, setDraftHeading] = useState(section.heading);
  const [draftContent, setDraftContent] = useState(section.content);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [edited, setEdited] = useState(Boolean(section.edited_at));
  const [regenerated, setRegenerated] = useState(Boolean(section.regenerated_at));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateReviewerSectionAction({ sectionId: section.id, heading: draftHeading, content: draftContent });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setHeading(draftHeading.trim());
      setContent(draftContent.trim());
      setEdited(true);
      setMode("view");
      router.refresh();
    });
  };

  const regenerate = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/reviewers/${reviewerId}/sections/${section.id}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const body = (await response.json().catch(() => ({}))) as { heading?: string; content?: string; error?: string };
      if (!response.ok || !body.content) {
        setError(body.error ?? "The section could not be regenerated.");
        return;
      }
      setHeading(body.heading ?? heading);
      setContent(body.content);
      setDraftHeading(body.heading ?? heading);
      setDraftContent(body.content);
      setRegenerated(true);
      setInstructions("");
      setMode("view");
      router.refresh();
    });
  };

  return (
    <section
      id={`section-${section.position + 1}`}
      aria-labelledby={`section-heading-${section.id}`}
      className={cn("rounded-xl border border-border bg-card p-5", pending && "opacity-80")}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        {mode === "edit" ? (
          <Input
            aria-label="Section heading"
            value={draftHeading}
            maxLength={200}
            onChange={(event) => setDraftHeading(event.target.value)}
            className="max-w-md font-semibold"
          />
        ) : (
          <h2 id={`section-heading-${section.id}`} className="text-lg font-semibold text-foreground">
            {heading}
          </h2>
        )}
        {mode === "view" && (
          <div className="flex items-center gap-1">
            {(edited || regenerated) && (
              <span className="mr-1 text-xs text-muted-foreground">{edited ? "Edited" : "Regenerated"}</span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")} aria-label={`Edit ${heading}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("regenerate")} aria-label={`Regenerate ${heading}`}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Regenerate
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}

      {mode === "edit" ? (
        <div className="flex flex-col gap-3">
          <Textarea
            aria-label="Section content (markdown)"
            value={draftContent}
            rows={Math.min(24, Math.max(8, draftContent.split("\n").length + 2))}
            onChange={(event) => setDraftContent(event.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Markdown: **bold**, _italic_, `code`, &quot;-&quot; bullets, &quot;1.&quot; numbered lists.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setDraftHeading(heading);
                setDraftContent(content);
                setError(null);
                setMode("view");
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
            <Button type="button" size="sm" loading={pending} onClick={save}>
              {!pending && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <Markdown source={content} />
      )}

      {mode === "regenerate" && (
        <form
          className="mt-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            regenerate();
          }}
        >
          <label htmlFor={`instructions-${section.id}`} className="text-sm font-medium">
            Regenerate this section only
          </label>
          <Input
            id={`instructions-${section.id}`}
            value={instructions}
            maxLength={500}
            placeholder="Optional instructions, e.g. “make it shorter” or “add a worked example”"
            onChange={(event) => setInstructions(event.target.value)}
            disabled={pending}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setMode("view")}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {pending ? "Rewriting…" : "Regenerate"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

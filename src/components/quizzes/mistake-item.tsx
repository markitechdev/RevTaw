"use client";

import { Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatRelativeDate } from "@/components/materials/material-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { updateMistakeAction } from "@/lib/quizzes/actions";
import type { MistakeListItem } from "@/lib/quizzes/queries";
import { routes } from "@/lib/routes";
import type { MistakeType } from "@/lib/supabase/database.types";

export const MISTAKE_TYPE_LABEL: Record<MistakeType, string> = {
  unclassified: "Not classified",
  misunderstood_concept: "Misunderstood the concept",
  forgotten_information: "Forgot the information",
  calculation_error: "Calculation error",
  misread_question: "Misread the question",
  confused_concepts: "Confused two concepts",
};

/** One mistake notebook entry: what was asked, what went wrong, and why. */
export function MistakeItem({ mistake }: { mistake: MistakeListItem }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resolved = Boolean(mistake.resolved_at);

  const update = (patch: { resolved?: boolean; errorType?: MistakeType }) => {
    setError(null);
    startTransition(async () => {
      const result = await updateMistakeAction({ mistakeId: mistake.id, ...patch });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {mistake.concept && <Badge tone="primary">{mistake.concept.name}</Badge>}
        {mistake.material && (
          <Link href={`${routes.materials}/${mistake.material.id}`} className="truncate text-muted-foreground hover:underline">
            {mistake.material.title}
          </Link>
        )}
        <span className="ml-auto text-muted-foreground">{formatRelativeDate(mistake.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap font-medium leading-snug">{mistake.question_text}</p>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-danger-soft/50 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</dt>
          <dd className="mt-1 whitespace-pre-wrap">{mistake.student_answer ?? <span className="text-muted-foreground">No answer</span>}</dd>
        </div>
        <div className="rounded-lg bg-success-soft/50 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correct answer</dt>
          <dd className="mt-1 whitespace-pre-wrap">{mistake.correct_answer}</dd>
        </div>
      </dl>
      {mistake.explanation && <p className="text-sm text-muted-foreground">{mistake.explanation}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`error-type-${mistake.id}`} className="text-xs font-medium text-muted-foreground">
          Why did it go wrong?
        </label>
        <div className="w-56">
          <Select
            id={`error-type-${mistake.id}`}
            value={mistake.error_type}
            disabled={pending}
            className="h-8 text-xs"
            onChange={(event) => update({ errorType: event.target.value as MistakeType })}
          >
            {(Object.keys(MISTAKE_TYPE_LABEL) as MistakeType[]).map((type) => (
              <option key={type} value={type}>
                {MISTAKE_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" size="sm" variant={resolved ? "ghost" : "secondary"} className="ml-auto" loading={pending} onClick={() => update({ resolved: !resolved })}>
          {!pending && (resolved ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />)}
          {resolved ? "Reopen" : "Mark as learned"}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

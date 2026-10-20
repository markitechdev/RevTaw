"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { startTaskAction } from "@/lib/planner/actions";

/** Starts (or resumes) a planner task's study session and goes there. */
export function StartTaskButton({ taskId, label, title }: { taskId: string; label: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        aria-label={`${label}: ${title}`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startTaskAction(taskId);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push(result.data.redirect);
          });
        }}
      >
        {!pending && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </Button>
      {error && (
        <span className="max-w-[12rem] text-right text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

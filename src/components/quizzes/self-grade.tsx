"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TINT } from "@/components/ui/tint";
import { selfGradeAction } from "@/lib/quizzes/actions";

/** Lets the student check an open answer the AI could not grade. */
export function SelfGradeControls({ answerId, quizId, attemptId, points }: { answerId: string; quizId: string; attemptId: string; points: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grade = (verdict: "correct" | "partial" | "incorrect") => {
    setError(null);
    startTransition(async () => {
      const result = await selfGradeAction({ answerId, quizId, attemptId, verdict });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={`mt-3 rounded-lg border p-3 text-sm ${TINT.warning}`}>
      <p className="font-medium">Check this one yourself</p>
      <p className="mt-0.5 text-muted-foreground">The AI grader was unavailable. Compare your answer with the model answer above and mark it.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => grade("correct")}>
          I got it right ({points})
        </Button>
        {points > 1 && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => grade("partial")}>
            Partly ({Math.max(1, Math.floor(points / 2))})
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => grade("incorrect")}>
          I got it wrong (0)
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

/** "Why is my answer wrong?" — opens the tutor on the material with the question, the student's answer and the correct one. */
export function AskWhyWrongButton({
  materialId,
  question,
  studentAnswer,
  correctAnswer,
  size = "sm",
}: {
  materialId: string | null;
  question: string;
  studentAnswer: string | null;
  correctAnswer: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/tutor/conversations", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          materialId,
          mode: "tutor",
          action: "why_wrong",
          message: `Question: ${question.slice(0, 1500)}\nMy answer: ${studentAnswer ?? "(no answer)"}\nCorrect answer: ${correctAnswer.slice(0, 1500)}\nWhy is my answer wrong?`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The tutor could not be reached.");
        return;
      }
      router.push(`${routes.tutor}/${body.id}`);
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size={size} variant="secondary" loading={pending} onClick={ask}>
        {!pending && <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />}
        Ask the tutor why
      </Button>
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

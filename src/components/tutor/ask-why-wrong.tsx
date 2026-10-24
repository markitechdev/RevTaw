"use client";

import { MessageCircle } from "lucide-react";

import { openAssistant } from "@/components/assistant/assistant-provider";
import { Button } from "@/components/ui/button";

/** "Why is my answer wrong?" — asks RevTaw right here, with the question, the student's answer and the correct one, grounded in the quiz's material. */
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
  const ask = () =>
    openAssistant({
      action: "why_wrong",
      materialId,
      send: true,
      prompt: `Question: ${question.slice(0, 1500)}\nMy answer: ${studentAnswer ?? "(no answer)"}\nCorrect answer: ${correctAnswer.slice(0, 1500)}\nWhy is my answer wrong?`,
    });

  return (
    <Button type="button" size={size} variant="secondary" onClick={ask} aria-haspopup="dialog">
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Ask Tamari why
    </Button>
  );
}

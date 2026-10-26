"use client";

import { MessageCircle } from "lucide-react";

import { openAssistant } from "@/components/assistant/assistant-provider";
import { Button } from "@/components/ui/button";
import { optionLetter } from "@/lib/quizzes/types";

/**
 * "Why is my answer wrong?" — asks RevTaw right here, with the question, its options (so Tamari can say why
 * each wrong one is wrong), the student's answer and the correct one, grounded in the quiz's material.
 */
export function AskWhyWrongButton({
  materialId,
  question,
  options = null,
  studentAnswer,
  correctAnswer,
  size = "sm",
}: {
  materialId: string | null;
  question: string;
  options?: ReadonlyArray<{ id: string; text: string }> | null;
  studentAnswer: string | null;
  correctAnswer: string;
  size?: "sm" | "md";
}) {
  const choices = options?.length ? `\nOptions:\n${options.map((option, position) => `${optionLetter(position)}. ${option.text.slice(0, 300)}`).join("\n")}` : "";
  const ask = () =>
    openAssistant({
      action: "why_wrong",
      materialId,
      send: true,
      prompt: `Question: ${question.slice(0, 1500)}${choices}\nMy answer: ${studentAnswer ?? "(no answer)"}\nCorrect answer: ${correctAnswer.slice(0, 1500)}\nWhy is my answer wrong?`,
    });

  return (
    <Button type="button" size={size} variant="secondary" onClick={ask} aria-haspopup="dialog">
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Ask Tamari why
    </Button>
  );
}

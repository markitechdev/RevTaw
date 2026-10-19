import { ListChecks } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Quiz",
};

export default function QuizPage() {
  return (
    <SectionPlaceholder
      title="Quiz"
      description="Generate quizzes from your materials, answer them, and get results that track mistakes at the concept level."
      icon={ListChecks}
      phase="Phase 3"
      emptyTitle="Quizzes need a material first"
      emptyDescription="Quiz generation, scoring and the mistake notebook are built right after uploads."
    />
  );
}

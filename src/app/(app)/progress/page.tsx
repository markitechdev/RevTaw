import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Progress",
};

export default function ProgressPage() {
  return (
    <SectionPlaceholder
      title="Progress"
      description="Accuracy, study time, streaks and a mastery map per subject and topic, in charts that stay understandable."
      icon={TrendingUp}
      phase="Phase 9"
      emptyTitle="Nothing to chart yet"
      emptyDescription="Progress fills in as you complete quizzes, flashcard reviews and sessions."
    />
  );
}

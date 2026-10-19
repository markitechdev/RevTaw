import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Study Methods",
};

export default function MethodsPage() {
  return (
    <SectionPlaceholder
      title="Study Methods"
      description="Active recall, spaced repetition, Pomodoro, Feynman, interleaving, blurting and more, each explained and each changing how a session runs."
      icon={Lightbulb}
      phase="Phase 4"
      emptyTitle="Method library coming with sessions"
      emptyDescription="RevTaw will recommend a method from your goal and performance. Until then, your main goal from onboarding is the starting signal."
    />
  );
}

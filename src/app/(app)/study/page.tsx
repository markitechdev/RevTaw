import { BookOpenCheck } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Study",
};

export default function StudyPage() {
  return (
    <SectionPlaceholder
      title="Study"
      description="Build a session from a material, your available time and a goal, then follow a guided plan that actually changes with the method you choose."
      icon={BookOpenCheck}
      phase="Phase 4"
      emptyTitle="Sessions start from a material"
      emptyDescription="Once materials and reviewers exist, the session builder will ask what you are studying, how much time you have and what you want to achieve."
    />
  );
}

import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Planner",
};

export default function PlannerPage() {
  return (
    <SectionPlaceholder
      title="Planner"
      description="Add exam dates and RevTaw will pace reviews toward them, balancing weak topics and overdue cards."
      icon={CalendarDays}
      phase="Phase 7"
      emptyTitle="No exams scheduled"
      emptyDescription="Exam countdowns and daily plans arrive with the planner phase."
    />
  );
}

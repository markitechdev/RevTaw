import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "AI Tutor",
};

export default function TutorPage() {
  return (
    <SectionPlaceholder
      title="AI Tutor"
      description="Ask questions about your own material and get answers grounded in it, with sources, instead of generic explanations."
      icon={MessageSquare}
      phase="Phase 5"
      emptyTitle="The tutor reads your materials"
      emptyDescription="Source-grounded answers depend on uploaded, analyzed materials, so the tutor opens after Phase 2."
    />
  );
}

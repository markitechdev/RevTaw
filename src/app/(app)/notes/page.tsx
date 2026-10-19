import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/app/section-placeholder";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <SectionPlaceholder
      title="Notes"
      description="Your saved reviewers, summaries, bullet notes and Cornell notes, all editable and regenerable section by section."
      icon={NotebookPen}
      phase="Phase 3"
      emptyTitle="Notes are generated from materials"
      emptyDescription="Every reviewer you generate and edit will be saved here."
    />
  );
}

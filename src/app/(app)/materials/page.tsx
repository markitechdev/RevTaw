import { FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SectionPlaceholder } from "@/components/app/section-placeholder";
import { buttonClasses } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Materials",
};

export default function MaterialsPage() {
  return (
    <SectionPlaceholder
      title="Materials"
      description="Upload PDFs, DOCX files, images, screenshots and typed notes. RevTaw extracts the text, analyzes the content and keeps everything private to you."
      icon={FolderOpen}
      phase="Phase 2"
      emptyTitle="Uploads arrive in the next phase"
      emptyDescription="Drag-and-drop upload with processing status, private storage and AI analysis are the next thing being built. Your study preferences are already saved and will shape what RevTaw generates."
      action={
        <Link href={routes.settingsPreferences} className={buttonClasses({ variant: "secondary", size: "sm" })}>Review study preferences</Link>
      }
    />
  );
}

import { ScrollText, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CreateReviewerForm } from "@/components/reviewers/create-reviewer-form";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SOURCE_LABEL } from "@/lib/materials/constants";
import { listMaterials } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "New reviewer",
};

export default async function NewReviewerPage({ searchParams }: PageProps<"/notes/new">) {
  const params = await searchParams;
  const materials = (await listMaterials()).filter((material) => material.status === "ready");
  const initial = typeof params.material === "string" ? params.material : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: routes.notes, label: "Reviewers" }} title="New reviewer" description="Turn one of your materials into study notes: a complete reviewer, a summary, Cornell notes, a cheat sheet and more." />
      {materials.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No material is ready yet"
          description="Reviewers are made from your materials. Upload a PDF, a Word file, a photo or notes, and come back once it is ready."
          action={
            <Link href={`${routes.materials}?upload=1`} className={buttonClasses({ size: "sm" })}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload material
            </Link>
          }
        />
      ) : (
        <CreateReviewerForm
          initialMaterialId={initial}
          materials={materials.map((material) => ({
            id: material.id,
            title: material.title,
            subject: material.subject?.name ?? null,
            meta: [SOURCE_LABEL[material.source], material.page_count ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
          }))}
        />
      )}
    </div>
  );
}

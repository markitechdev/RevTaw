import Link from "next/link";

import { formatRelativeDate } from "@/components/materials/material-card";
import { TEXT_LINK } from "@/components/ui/text-link";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

type SourceMaterial = { id: string; title: string; subject: { name: string } | null } | null;

/** The meta line of a reviewer, a quiz or a deck: "From <material> · Biology · created 2 days ago · <provider>". */
export function MadeFrom({ material, createdAt, provider }: { material: SourceMaterial; createdAt: string; provider: string | null }) {
  return (
    <>
      {material ? (
        <>
          From{" "}
          <Link href={`${routes.materials}/${material.id}`} className={cn(TEXT_LINK, "wrap-anywhere")}>
            {material.title}
          </Link>
          {material.subject ? ` · ${material.subject.name}` : ""}
        </>
      ) : (
        "Source material removed"
      )}
      {" · "}created {formatRelativeDate(createdAt)}
      {provider ? ` · ${provider}` : ""}
    </>
  );
}

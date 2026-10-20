import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatRelativeDate } from "@/components/materials/material-card";
import { MnemonicLibrary } from "@/components/study/mnemonic-library";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { listMaterials } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";
import { listSavedMnemonics } from "@/lib/study/flows/memory";

export const metadata: Metadata = {
  title: "Memory aids",
};

export default async function MemoryAidsPage({ searchParams }: PageProps<"/study/memory">) {
  const params = await searchParams;
  const favoritesOnly = params.view === "favorites";
  const [mnemonics, materials] = await Promise.all([listSavedMnemonics({ favorites: favoritesOnly }), listMaterials()]);

  return (
    <div className="flex flex-col gap-6">
      <Link href={routes.study} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Study
      </Link>
      <PageHeader title="Memory aids" description="The mnemonics you saved from Mnemonics sessions or wrote yourself. Star the ones that work, and practice recalling the lists from them." />
      <MnemonicLibrary
        favoritesOnly={favoritesOnly}
        materials={materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title }))}
        mnemonics={mnemonics.map((mnemonic) => ({
          id: mnemonic.id,
          kind: mnemonic.kind,
          target: mnemonic.target,
          items: mnemonic.items,
          content: mnemonic.content,
          explanation: mnemonic.explanation,
          source: mnemonic.source,
          favorite: mnemonic.favorite,
          material: mnemonic.material,
          practicedLabel: mnemonic.last_practiced_at ? `practiced ${formatRelativeDate(mnemonic.last_practiced_at)}` : "not practiced yet",
        }))}
      />
    </div>
  );
}

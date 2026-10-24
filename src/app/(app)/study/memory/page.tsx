import type { Metadata } from "next";

import { formatRelativeDate } from "@/components/materials/material-card";
import { MnemonicLibrary } from "@/components/study/mnemonic-library";
import { PalaceLibrary } from "@/components/study/palace-editor";
import { PageHeader } from "@/components/ui/page-header";
import { listMaterials } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";
import { listPalaces, listSavedMnemonics } from "@/lib/study/flows/memory";

export const metadata: Metadata = {
  title: "Memory aids",
};

export default async function MemoryAidsPage({ searchParams }: PageProps<"/study/memory">) {
  const params = await searchParams;
  const favoritesOnly = params.view === "favorites";
  const [mnemonics, materials, palaces] = await Promise.all([listSavedMnemonics({ favorites: favoritesOnly }), listMaterials(), listPalaces()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: routes.study, label: "Study" }} title="Memory aids" description="The mnemonics you saved or wrote yourself, and the memory palaces you walk. Star the mnemonics that work, practice recalling their lists, and keep your routes up to date." />
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
      <PalaceLibrary palaces={palaces} lastUsedLabels={Object.fromEntries(palaces.map((palace) => [palace.id, palace.lastUsedAt ? `walked ${formatRelativeDate(palace.lastUsedAt)}` : "not walked yet"]))} />
    </div>
  );
}

import { NextResponse } from "next/server";

import { listMaterials } from "@/lib/materials/queries";
import { getCurrentUser } from "@/lib/supabase/server";

/** Ready materials (id and title) for pickers such as Ask RevTaw's "attach material". */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const materials = (await listMaterials()).filter((material) => material.status === "ready");
  return NextResponse.json(
    { materials: materials.slice(0, 100).map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null })) },
    { headers: { "cache-control": "private, no-store" } },
  );
}

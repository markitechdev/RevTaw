import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient, getCurrentUser } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid() });

/** Lightweight status poll used while a material is being processed. */
export async function GET(_request: Request, context: RouteContext<"/api/materials/[id]/status">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("status, status_detail, updated_at")
    .eq("id", params.data.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not read the status." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  return NextResponse.json(
    { status: data.status, detail: data.status_detail, updatedAt: data.updated_at },
    { headers: { "cache-control": "no-store" } },
  );
}

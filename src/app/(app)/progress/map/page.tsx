import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MasteryMapView } from "@/components/analytics/mastery-map";
import { PageHeader } from "@/components/ui/page-header";
import { MASTERY_THRESHOLD } from "@/lib/adaptive/mastery";
import { getMasteryMap } from "@/lib/analytics/map";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Mastery map",
};

/** Knowledge / mastery map (§24): every practiced concept by subject and material, with the next session a click away. */
export default async function MasteryMapPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const map = await getMasteryMap();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: routes.progress, label: "Progress" }} title="Mastery map" description={`Every concept you have practiced, grouped by subject and material, with its mastery and status (mastered at ${MASTERY_THRESHOLD}%). Pick a weak concept and start the session RevTaw recommends for it.`} />
      <MasteryMapView map={map} />
    </div>
  );
}

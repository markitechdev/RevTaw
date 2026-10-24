import type { Metadata } from "next";
import Link from "next/link";

import { DashboardCustomizerForm } from "@/components/dashboard/customizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TEXT_LINK } from "@/components/ui/text-link";
import { getPreferences } from "@/lib/preferences/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardSettingsPage() {
  const preferences = await getPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <CardDescription>
          Pick the widgets on your{" "}
          <Link href={routes.dashboard} className={TEXT_LINK}>
            Home
          </Link>{" "}
          page and their order. You can also do this from Home with the Customize button.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DashboardCustomizerForm layout={preferences.dashboard} />
      </CardContent>
    </Card>
  );
}

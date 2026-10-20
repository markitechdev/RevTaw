import type { Metadata } from "next";

import { ToolsForm } from "@/components/settings/tools-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences } from "@/lib/preferences/queries";

export const metadata: Metadata = {
  title: "RevTaw tools",
};

export default async function ToolsSettingsPage() {
  const preferences = await getPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>My RevTaw tools</CardTitle>
        <CardDescription>Pin the tools you use to the navigation. The rest wait under More Tools, and the command menu (Ctrl K) reaches all of them.</CardDescription>
      </CardHeader>
      <CardContent>
        <ToolsForm pinned={preferences.tools.pinned} />
      </CardContent>
    </Card>
  );
}

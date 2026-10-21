import type { Metadata } from "next";

import { AiPreferencesForm } from "@/components/settings/ai-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences } from "@/lib/preferences/queries";

export const metadata: Metadata = {
  title: "AI preferences",
};

export default async function AiSettingsPage() {
  const preferences = await getPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI preferences</CardTitle>
        <CardDescription>How RevTaw talks to you: the language, the tone and how deep it goes. Asking for something else in a message always wins for that answer.</CardDescription>
      </CardHeader>
      <CardContent>
        <AiPreferencesForm initial={preferences.ai} />
      </CardContent>
    </Card>
  );
}

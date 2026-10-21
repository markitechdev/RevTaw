import type { Metadata } from "next";

import { AiPreferencesForm } from "@/components/settings/ai-form";
import { TamariPreferencesForm } from "@/components/settings/assistant-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences } from "@/lib/preferences/queries";

export const metadata: Metadata = {
  title: "AI preferences",
};

export default async function AiSettingsPage() {
  const preferences = await getPreferences();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>AI preferences</CardTitle>
          <CardDescription>How RevTaw talks to you: the language, the tone and how deep it goes. Asking for something else in a message always wins for that answer.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiPreferencesForm initial={preferences.ai} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tamari Assistant</CardTitle>
          <CardDescription>Your study companion: it follows you around RevTaw, knows which page you are on and stays quiet until you need it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TamariPreferencesForm initial={preferences.assistant} />
        </CardContent>
      </Card>
    </div>
  );
}

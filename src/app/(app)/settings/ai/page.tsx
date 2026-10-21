import type { Metadata } from "next";

import { AiPreferencesForm } from "@/components/settings/ai-form";
import { AssistantPreferencesForm } from "@/components/settings/assistant-form";
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
          <CardTitle>Tamari</CardTitle>
          <CardDescription>Your study companion: it follows you around RevTaw and knows which page you are on.</CardDescription>
        </CardHeader>
        <CardContent>
          <AssistantPreferencesForm initial={preferences.assistant} />
        </CardContent>
      </Card>
    </div>
  );
}

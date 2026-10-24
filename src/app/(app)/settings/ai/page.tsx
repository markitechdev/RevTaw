import type { Metadata } from "next";

import { AiPreferencesForm } from "@/components/settings/ai-form";
import { TamariPreferencesForm } from "@/components/settings/assistant-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences } from "@/lib/preferences/queries";

export const metadata: Metadata = {
  title: "Tamari & AI",
};

export default async function AiSettingsPage() {
  const preferences = await getPreferences();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Tamari</CardTitle>
          <CardDescription>Your study companion: it lives on Home, knows which page you are on and stays quiet until it has something useful to say. Everything here is optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <TamariPreferencesForm initial={preferences.assistant} ai={preferences.ai} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How Tamari explains</CardTitle>
          <CardDescription>The tone and how deep Tamari&apos;s explanations go, in the panel and on Ask Tamari. Asking for something else in a message always wins for that answer.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiPreferencesForm initial={preferences.ai} />
        </CardContent>
      </Card>
    </div>
  );
}

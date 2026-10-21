import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PreferencesForm } from "@/components/settings/preferences-form";
import { PreferredMethodsForm } from "@/components/settings/preferred-methods-form";
import { TimezoneForm } from "@/components/settings/timezone-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences } from "@/lib/preferences/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Study preferences",
};

export default async function PreferencesSettingsPage() {
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);
  const preferences = await getPreferences();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Study preferences</CardTitle>
          <CardDescription>
            The answers from onboarding. Update them whenever your situation changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            defaults={{
              educationLevel: profile?.education_level,
              mainGoal: profile?.main_goal,
              sessionMinutes: profile?.preferred_session_minutes,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time zone</CardTitle>
          <CardDescription>Detected from your browser the first time you signed in. Change it if you study from somewhere else.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimezoneForm current={profile?.timezone ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferred study methods</CardTitle>
          <CardDescription>The methods you like best. The session builder lists them first, next to RevTaw&apos;s recommendation; every other method stays one click away.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferredMethodsForm initial={preferences.study.preferredMethods} />
        </CardContent>
      </Card>
    </div>
  );
}

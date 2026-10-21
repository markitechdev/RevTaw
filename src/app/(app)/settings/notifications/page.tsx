import type { Metadata } from "next";

import { NotificationsForm } from "@/components/settings/notifications-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isEmailConfigured } from "@/lib/notifications/email-config";
import { getPreferences } from "@/lib/preferences/queries";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationSettingsPage() {
  const preferences = await getPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Reminders that help without nagging: choose where they reach you and what they are about.</CardDescription>
      </CardHeader>
      <CardContent>
        <NotificationsForm initial={preferences.notifications} emailAvailable={isEmailConfigured()} />
      </CardContent>
    </Card>
  );
}

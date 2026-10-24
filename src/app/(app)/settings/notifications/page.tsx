import type { Metadata } from "next";

import { CalendarSettings } from "@/components/settings/calendar-settings";
import { NotificationsForm } from "@/components/settings/notifications-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarConfigured } from "@/lib/calendar/google";
import { getCalendarConnection } from "@/lib/calendar/queries";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/planner/dates";
import { plannerClock } from "@/lib/planner/service";
import { getPreferences } from "@/lib/preferences/queries";
import { emailRemindersAvailable } from "@/lib/reminders/service";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationSettingsPage({ searchParams }: PageProps<"/settings/notifications">) {
  const [preferences, connection, query, clock] = await Promise.all([getPreferences(), getCalendarConnection(), searchParams, plannerClock()]);
  const timeZone = isValidTimezone(clock.timezone) ? clock.timezone : DEFAULT_TIMEZONE;
  const notice = typeof query.calendar === "string" ? query.calendar : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Reminders that help without nagging: choose where they reach you and what they are about.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationsForm initial={preferences.notifications} emailAvailable={emailRemindersAvailable()} />
        </CardContent>
      </Card>
      <Card id="calendar">
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Optional: see your RevTaw plan next to your classes and everything else in Google Calendar.</CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarSettings configured={calendarConfigured()} connection={connection} notice={notice} timeZone={timeZone} />
        </CardContent>
      </Card>
    </div>
  );
}

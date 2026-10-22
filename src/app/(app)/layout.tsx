import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { NotificationsMenu } from "@/components/app/notifications-menu";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { ReminderWatcher } from "@/components/planner/reminder-watcher";
import { AppearanceRoot } from "@/components/theme/appearance-root";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications/service";
import { getPreferences } from "@/lib/preferences/queries";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";
import { voiceCapabilities } from "@/lib/voice/server";

/**
 * Layout for every signed-in screen. The proxy already redirects anonymous
 * visitors, but the user is verified again here so that the app never renders
 * for a request whose token failed verification. Students who have not
 * finished onboarding are sent there first.
 */
export default async function AppLayout({ children }: LayoutProps<"/"> ) {
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) {
    redirect(routes.login);
  }
  if (profile && !profile.onboarding_completed_at) {
    redirect(routes.onboarding);
  }
  const [notifications, unread, preferences] = await Promise.all([listNotifications(12), countUnreadNotifications(), getPreferences()]);

  return (
    <AppearanceRoot appearance={preferences.appearance}>
      <AssistantProvider ai={preferences.ai} assistant={preferences.assistant} voiceServer={voiceCapabilities()}>
        <AppShell displayName={profile?.display_name ?? ""} email={user.email} pinned={preferences.tools.pinned} notifications={<NotificationsMenu notifications={notifications} unread={unread} />}>
          <TimezoneSync current={profile?.timezone ?? null} />
          <ReminderWatcher />
          {children}
        </AppShell>
      </AssistantProvider>
    </AppearanceRoot>
  );
}

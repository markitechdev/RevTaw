import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

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

  return (
    <AppShell displayName={profile?.display_name ?? ""} email={user.email}>
      {children}
    </AppShell>
  );
}

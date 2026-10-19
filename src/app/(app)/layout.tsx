import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
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
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo href={routes.dashboard} />
          <div className="flex items-center gap-2">
            <Link
              href={routes.settings}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {profile?.display_name || "Settings"}
            </Link>
            <ThemeToggle />
            <SignOutButton variant="ghost" size="sm" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

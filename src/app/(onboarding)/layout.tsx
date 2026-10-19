import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

/** Focused layout for first-run onboarding: no app navigation yet. */
export default async function OnboardingLayout({ children }: LayoutProps<"/"> ) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton variant="ghost" size="sm" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4 sm:px-6">{children}</main>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getRecoveryState } from "@/lib/auth/recovery";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/**
 * Reached from the password-recovery email. The link signs the student in,
 * and for the next 15 minutes that session may set a new password without
 * the old one. Any other signed-in visit goes to Settings → Account, which
 * asks for the current password first.
 */
export default async function ResetPasswordPage() {
  const { user, fresh } = await getRecoveryState();
  if (!user) {
    redirect(`${routes.forgotPassword}?error=expired`);
  }
  if (!fresh) {
    redirect(`${routes.settingsAccount}?notice=use-current-password`);
  }

  return (
    <AuthCard
      title="Choose a new password"
      description={
        user.email ? (
          <>
            Setting a new password for{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </>
        ) : (
          "Pick something memorable that you have not used before."
        )
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}

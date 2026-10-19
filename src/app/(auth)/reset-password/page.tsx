import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/**
 * Reached from the password-recovery email. The link signs the student in with
 * a short-lived session, which is all this page needs to set a new password.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${routes.forgotPassword}?error=expired`);
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

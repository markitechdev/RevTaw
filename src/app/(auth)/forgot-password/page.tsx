import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { routes } from "@/lib/routes";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const expired = params.error === "expired";
  const captchaSiteKey = await turnstileSiteKey();

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you registered with and we will send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm expired={expired} captchaSiteKey={captchaSiteKey} />
    </AuthCard>
  );
}

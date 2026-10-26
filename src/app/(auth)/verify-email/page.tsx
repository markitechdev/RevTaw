import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { Alert } from "@/components/forms/form-alert";
import { TEXT_LINK } from "@/components/ui/text-link";
import { getPendingVerification } from "@/lib/auth/pending-email";
import { routes } from "@/lib/routes";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = {
  title: "Verify your email",
};

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const pending = await getPendingVerification();
  const email = pending?.email ?? null;
  // Each email sent has its own `resendAt`, so each starts a new countdown on the button.
  const cooldown = pending && pending.resendInSeconds > 0 ? { seconds: pending.resendInSeconds, key: String(pending.resendAt) } : null;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const error = typeof params.error === "string" ? params.error : "";
  const captchaSiteKey = await turnstileSiteKey();

  return (
    <AuthCard
      title="Check your inbox"
      description={
        email ? (
          <>
            We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
          </>
        ) : (
          "Verify your email address to activate your RevTaw account."
        )
      }
      footer={
        <>
          Wrong address?{" "}
          <Link href={routes.register} className={TEXT_LINK}>
            Register again
          </Link>{" "}
          or{" "}
          <Link href={routes.login} className={TEXT_LINK}>
            sign in
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {reason === "unconfirmed" && (
          <Alert tone="info">
            Your email is not verified yet. Open the link we sent you to finish setting up your
            account.
          </Alert>
        )}
        {error === "expired" && (
          <Alert tone="error">
            That verification link has expired or was already used. Request a new one below.
          </Alert>
        )}

        <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Open the link in the email to continue.</p>
            <p>
              It can take a minute to arrive. Check your spam or promotions folder if you do not see
              it.
            </p>
          </div>
        </div>

        <ResendVerificationForm email={email} cooldown={cooldown} captchaSiteKey={captchaSiteKey} />
      </div>
    </AuthCard>
  );
}

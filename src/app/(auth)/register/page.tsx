import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { routes } from "@/lib/routes";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function RegisterPage() {
  const captchaSiteKey = await turnstileSiteKey();

  return (
    <AuthCard
      title="Create your account"
      description="Turn your class materials into reviewers, quizzes and flashcards."
      footer={
        <>
          Already have an account?{" "}
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm captchaSiteKey={captchaSiteKey} />
    </AuthCard>
  );
}

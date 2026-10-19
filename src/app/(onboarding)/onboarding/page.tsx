import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Set up your study profile",
};

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) redirect(routes.login);
  if (profile?.onboarding_completed_at) redirect(routes.dashboard);

  const firstName = profile?.display_name?.split(" ")[0];
  const verified = params.verified === "1";

  return (
    <div className="flex flex-col gap-6">
      {verified && (
        <Alert tone="success">Your email is verified. Welcome to RevTaw!</Alert>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Quick setup · about a minute</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `Hi ${firstName}, let's set up your reviewer.` : "Let's set up your reviewer."}
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Three quick questions so RevTaw can pitch explanations at the right level, recommend the
          right study methods, and build sessions that fit your time.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 sm:p-8">
          <OnboardingForm
            defaults={{
              educationLevel: profile?.education_level,
              mainGoal: profile?.main_goal,
              sessionMinutes: profile?.preferred_session_minutes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

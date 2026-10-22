import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsConfigured } from "@/lib/analytics/server";
import { getServerEnv } from "@/lib/env";
import { getPreferences } from "@/lib/preferences/queries";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account settings",
};

const NOTICES: Record<string, string> = {
  "email-updated": "Your email address has been updated.",
};

export default async function AccountSettingsPage({ searchParams }: PageProps<"/settings/account">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const preferences = await getPreferences();
  const deletionEnabled = Boolean(getServerEnv().SUPABASE_SECRET_KEY);

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{user.email}</span>.
            Changing your password signs out your other devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>Choose what RevTaw may learn about how you use it.</CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacyForm initial={preferences.privacy} available={analyticsConfigured()} />
        </CardContent>
      </Card>

      <Card className="border-danger/40">
        <CardHeader>
          <CardTitle className="text-danger">Delete account</CardTitle>
          <CardDescription>
            Remove your account and all study data. Your materials and generated content belong to
            you, so this cannot be undone by anyone, including RevTaw.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm enabled={deletionEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}

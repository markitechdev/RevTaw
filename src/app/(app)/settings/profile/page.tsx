import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Profile settings",
};

export default async function ProfileSettingsPage() {
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How RevTaw addresses you across the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm displayName={profile?.display_name ?? ""} email={user.email ?? ""} />
      </CardContent>
    </Card>
  );
}

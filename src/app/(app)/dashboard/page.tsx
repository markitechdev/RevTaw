import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert } from "@/components/forms/form-alert";
import {
  EDUCATION_LEVEL_LABEL,
  formatSessionMinutes,
  STUDY_GOAL_LABEL,
} from "@/lib/profile/options";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Dashboard",
};

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been updated. Other devices have been signed out.",
  welcome: "You're all set. Upload your first material to start building reviewers.",
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const { user, profile } = await getCurrentUserWithProfile();
  if (!user) redirect(routes.login);

  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile?.display_name ? `Welcome, ${profile.display_name}` : "Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile?.education_level ? EDUCATION_LEVEL_LABEL[profile.education_level] : "Level not set"}
          {" · "}
          {profile?.main_goal ? STUDY_GOAL_LABEL[profile.main_goal] : "Goal not set"}
          {" · "}
          {formatSessionMinutes(profile?.preferred_session_minutes ?? null)} sessions
        </p>
      </div>
    </div>
  );
}

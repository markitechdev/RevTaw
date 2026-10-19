import type { Metadata } from "next";

import { Alert } from "@/components/forms/form-alert";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been updated. Other devices have been signed out.",
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user?.email}</span>.
        </p>
      </div>
    </div>
  );
}

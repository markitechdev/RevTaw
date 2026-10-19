import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { routes, safeNextPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Sign in",
};

const NOTICES: Record<string, { tone: "error" | "success" | "info"; message: string }> = {
  link: {
    tone: "error",
    message: "That link is invalid or has expired. Sign in, or request a new link if you need one.",
  },
  "signed-out": { tone: "info", message: "You have been signed out." },
  "account-deleted": {
    tone: "success",
    message: "Your account and study data have been deleted.",
  },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextParam = typeof params.next === "string" ? params.next : undefined;
  const next = nextParam ? safeNextPath(nextParam) : undefined;
  const code =
    typeof params.error === "string"
      ? params.error
      : typeof params.notice === "string"
        ? params.notice
        : "";
  const notice = NOTICES[code] ?? null;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue your reviewers, quizzes and study sessions."
      footer={
        <>
          New to RevTaw?{" "}
          <Link href={routes.register} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next !== routes.dashboard ? next : undefined} notice={notice} />
    </AuthCard>
  );
}

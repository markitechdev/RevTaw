import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmLinkForm } from "@/components/auth/confirm-link-form";
import { CONFIRM_COPY, isConfirmType, isTokenHash } from "@/lib/auth/confirm";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Confirm",
  robots: { index: false, follow: false },
};

/**
 * Where the email templates' links land (supabase/README.md). Opening the
 * link only shows this page; the link is used when the student presses the
 * button (src/lib/auth/confirm-actions.ts).
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  if (!isTokenHash(tokenHash) || !isConfirmType(type)) {
    redirect(`${routes.login}?error=link`);
  }

  const copy = CONFIRM_COPY[type];
  return (
    <AuthCard title={copy.title} description={copy.description}>
      <ConfirmLinkForm tokenHash={tokenHash} type={type} next={next} label={copy.button} />
    </AuthCard>
  );
}

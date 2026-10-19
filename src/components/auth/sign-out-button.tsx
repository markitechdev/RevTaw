"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutButton({
  children = "Sign out",
  ...props
}: Omit<ButtonProps, "onClick" | "loading" | "type">) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      loading={pending}
      onClick={() => startTransition(() => signOutAction())}
      {...props}
    >
      {!pending && <LogOut className="h-4 w-4" aria-hidden="true" />}
      {children}
    </Button>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A link to a page of its own in the landing page's header (About), marked as the current page while you're on it. */
export function HeaderNavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={cn("hover:text-foreground", current && "text-foreground")}>
      {children}
    </Link>
  );
}

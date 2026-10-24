import Link from "next/link";

import { SkipLink } from "@/components/app/skip-link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";

export default function AuthLayout({ children }: LayoutProps<"/"> ) {
  return (
    <div className="flex min-h-full flex-col">
      <SkipLink />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 outline-none sm:pt-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-6 text-center text-xs text-muted-foreground">
        <span>
          {BRAND.name} · <span lang="fil">{BRAND.motto}</span>
        </span>
        <nav aria-label="Footer" className="flex items-center gap-3">
          <Link href={routes.privacy} className="hover:text-foreground">
            Privacy
          </Link>
          <Link href={routes.terms} className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}

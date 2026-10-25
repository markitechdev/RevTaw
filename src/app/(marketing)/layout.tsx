import Link from "next/link";
import { SkipLink } from "@/components/app/skip-link";
import { Logo } from "@/components/brand/logo";
import { SocialLinks } from "@/components/marketing/social-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";

export default function MarketingLayout({ children }: LayoutProps<"/"> ) {
  return (
    <div className="flex min-h-full flex-col">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link href="/#features" className="hover:text-foreground">What it does</Link>
            <Link href="/#how-it-works" className="hover:text-foreground">How it works</Link>
            <Link href="/#study-methods" className="hover:text-foreground">Study methods</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Link href="/login" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClasses({ size: "sm" })}>
              Start studying
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-semibold text-foreground">{BRAND.name}</p>
            <p>
              <span lang="fil">{BRAND.motto}</span> {BRAND.tagline}
            </p>
            {/* Pulled left by the icon's inset, so the first icon lines up with the text above. */}
            <SocialLinks className="mt-2 -ml-2.5 pointer-coarse:-ml-3" />
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={routes.login} className="hover:text-foreground">Sign in</Link>
            <Link href={routes.register} className="hover:text-foreground">Create account</Link>
            <Link href={routes.privacy} className="hover:text-foreground">Privacy</Link>
            <Link href={routes.terms} className="hover:text-foreground">Terms</Link>
            <ThemeToggle className="sm:hidden" />
          </nav>
        </div>
      </footer>
    </div>
  );
}

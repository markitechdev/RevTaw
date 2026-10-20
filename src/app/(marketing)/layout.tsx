import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function MarketingLayout({ children }: LayoutProps<"/"> ) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">What it does</a>
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#study-methods" className="hover:text-foreground">Study methods</a>
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

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-semibold text-foreground">{BRAND.name}</p>
            <p>{BRAND.motto} {BRAND.tagline}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Create account</Link>
            <ThemeToggle className="sm:hidden" />
          </div>
        </div>
      </footer>
    </div>
  );
}

import { SkipLink } from "@/components/app/skip-link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BRAND } from "@/lib/brand";

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

      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        {BRAND.name} · <span lang="fil">{BRAND.motto}</span>
      </footer>
    </div>
  );
}

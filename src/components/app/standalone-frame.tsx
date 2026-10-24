import type { ReactNode } from "react";

import { SkipLink } from "@/components/app/skip-link";
import { Logo } from "@/components/brand/logo";

/**
 * The frame of a page shown outside every layout (a missing page, an error the layouts could not show): the
 * skip link, the logo and one main area, centered. Pages inside the app use the app shell instead.
 */
export function StandaloneFrame({ children }: { children: ReactNode }) {
  return (
    // flex-1: the body is a flex column, so the frame fills the window and the message sits in its middle.
    <div className="flex min-h-full flex-1 flex-col">
      <SkipLink />
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 pb-16 outline-none">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">{children}</div>
      </main>
    </div>
  );
}

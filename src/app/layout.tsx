import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { BRAND } from "@/lib/brand";
import { APPEARANCE_COOKIE, appearanceAttributes, decodeAppearance } from "@/lib/theme/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d17" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce generated in src/proxy.ts. Reading headers makes
  // every page dynamic, which nonce-based CSP requires anyway.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Theme color and reduced motion for the first paint (validated cookie;
  // the signed-in app frame re-applies the account value on top).
  const appearance = decodeAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);

  return (
    // suppressHydrationWarning: the inline script below sets the `dark` class
    // before hydration, which React would otherwise flag as a mismatch.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning {...(appearance ? appearanceAttributes(appearance) : {})}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

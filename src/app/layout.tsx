import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { APPEARANCE_COOKIE, decodeAppearance, themeColorAttributes } from "@/lib/theme/appearance";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute addresses for the share image and canonical links: the production address (NEXT_PUBLIC_SITE_URL).
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  // Who made the site, on every page (<meta name="author">, <link rel="author">, <meta name="creator">).
  authors: [{ name: BRAND.creatorFullName, url: routes.about }],
  creator: BRAND.creatorFullName,
  // The preview a link gets on Messenger, Facebook, X and in chats; the image is app/opengraph-image.png.
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    locale: "en_PH",
    title: `${BRAND.name} — ${BRAND.motto} ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: { card: "summary_large_image" },
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
  // The theme color for the first paint (validated cookie; the signed-in app
  // frame re-applies the account value on top). Reduce motion is not set here:
  // it applies inside the app only, so the landing page keeps its animation.
  const appearance = decodeAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);

  return (
    // suppressHydrationWarning: the inline script below sets the `dark` class
    // before hydration, which React would otherwise flag as a mismatch.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning {...(appearance ? themeColorAttributes(appearance) : {})}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

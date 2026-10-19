import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Security headers applied to every response. The Content-Security-Policy is
 * set per request in `src/proxy.ts` because it carries a nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Cache Components / PPR is intentionally off for now: every authenticated
  // route in RevTaw is per-user, so there is little to prerender, and the
  // "uncached access outside <Suspense>" build rule adds friction across a
  // multi-session build. Re-enable later per the Next.js migration guide.
  cacheComponents: false,
  poweredByHeader: false,
  // Document parsers ship their own workers/native bindings; keep them out of
  // the bundler and load them from node_modules at runtime.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "mammoth", "word-extractor"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // The settings index has no content of its own.
      { source: "/settings", destination: "/settings/profile", permanent: false },
    ];
  },
};

export default nextConfig;

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
    // The microphone is allowed for RevTaw itself (Ask RevTaw's voice mode), never for embedded frames.
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
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
  // the bundler and load them from node_modules at runtime. The extraction
  // child (src/lib/materials/extract-sandbox.ts) imports them there;
  // src/lib/materials/parser-modules.ts keeps them in the deployment.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "mammoth", "word-extractor", "@react-pdf/renderer"],
  // pdf.js loads its worker through a computed path that tracing cannot see.
  outputFileTracingIncludes: {
    "/api/materials/\\[id\\]/process": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/materials/\\[id\\]/analyze": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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
      {
        // A text material's original opens in a sandboxed frame inside RevTaw, so this route
        // may be framed by RevTaw itself (its own CSP says frame-ancestors 'self'). Later rules win.
        source: "/api/materials/:id/file",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
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

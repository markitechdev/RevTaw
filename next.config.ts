import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / PPR is intentionally off for now: every authenticated
  // route in RevTaw is per-user, so there is little to prerender, and the
  // "uncached access outside <Suspense>" build rule adds friction across a
  // multi-session build. Re-enable later per the Next.js migration guide.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

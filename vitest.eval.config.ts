import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * `npm run eval:tamari`: runs Tamari's evaluation (src/lib/tutor/tamari.eval.ts) against the real AI providers
 * in .env.local. Separate from `npm test`, which never calls an AI service.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.eval.ts"],
    env: loadEnv("development", process.cwd(), ""),
    // A case may wait out two per-minute rate limits before its answer arrives.
    testTimeout: 300_000,
    fileParallelism: false,
  },
});

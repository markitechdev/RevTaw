import { makeZodJitless } from "@/lib/zod-jitless";

// Runs before the app's own code in the browser (see src/lib/zod-jitless.ts).
makeZodJitless();

import { z } from "zod";

/**
 * Environment access for RevTaw.
 *
 * - Public values (NEXT_PUBLIC_*) are safe to ship to the browser: the Supabase
 *   URL and publishable key are designed to be public; RLS protects the data.
 * - Server values must never be referenced from client components. They are
 *   only read lazily, inside functions, so a missing variable produces a clear
 *   error at request time instead of crashing the build.
 *
 * Copy `.env.example` to `.env.local` to configure a local checkout.
 */

const MISSING_HINT =
  "Copy .env.example to .env.local and fill in the values from your Supabase project (Project Settings → API).";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
});

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

/**
 * Browser-safe configuration. Values are referenced by their full literal name
 * so that Next.js can inline them into client bundles at build time.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `RevTaw is not configured: ${formatIssues(parsed.error)}. ${MISSING_HINT}`,
    );
  }

  return parsed.data;
}

/**
 * Server-only configuration. Never import this from a client component.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });

  if (!parsed.success) {
    throw new Error(
      `RevTaw server configuration is invalid: ${formatIssues(parsed.error)}.`,
    );
  }

  return parsed.data;
}

/**
 * Absolute origin of this deployment, used to build email redirect links.
 * Falls back to the Vercel-provided URL, then to localhost for development.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

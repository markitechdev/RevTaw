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
  // AI provider selection (see src/lib/ai). Keys never leave the server.
  // "auto" (or empty) routes each request through every configured provider
  // in order; naming one provider pins every request to it.
  AI_PROVIDER: z.enum(["auto", "groq", "cloudflare", "ollama", "anthropic", "openai", "google", "mock"]).optional(),
  AI_PROVIDER_ORDER: z.string().min(1).optional(),
  AI_DAILY_LIMITS: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL_FAST: z.string().min(1).optional(),
  AI_MODEL_STRONG: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL_FAST: z.string().min(1).optional(),
  GROQ_MODEL_STRONG: z.string().min(1).optional(),
  GROQ_MAX_REQUEST_TOKENS: z.coerce.number().int().min(1000).max(10_000_000).optional(),
  GROQ_BASE_URL: z.url().optional(),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[a-f0-9]{32}$/i, "CLOUDFLARE_ACCOUNT_ID must be the 32-character account ID from the Cloudflare dashboard")
    .optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_MODEL_FAST: z.string().min(1).optional(),
  CLOUDFLARE_MODEL_STRONG: z.string().min(1).optional(),
  CLOUDFLARE_VISION_MODEL: z.string().min(1).optional(),
  CLOUDFLARE_AI_BASE_URL: z.url().optional(),
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL_FAST: z.string().min(1).optional(),
  OLLAMA_MODEL_STRONG: z.string().min(1).optional(),
  OLLAMA_CONTEXT_TOKENS: z.coerce.number().int().min(1000).max(10_000_000).optional(),
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
    AI_PROVIDER: process.env.AI_PROVIDER || undefined,
    AI_PROVIDER_ORDER: process.env.AI_PROVIDER_ORDER || undefined,
    AI_DAILY_LIMITS: process.env.AI_DAILY_LIMITS || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || undefined,
    AI_MODEL_FAST: process.env.AI_MODEL_FAST || undefined,
    AI_MODEL_STRONG: process.env.AI_MODEL_STRONG || undefined,
    GROQ_API_KEY: process.env.GROQ_API_KEY || undefined,
    GROQ_MODEL_FAST: process.env.GROQ_MODEL_FAST || undefined,
    GROQ_MODEL_STRONG: process.env.GROQ_MODEL_STRONG || undefined,
    GROQ_MAX_REQUEST_TOKENS: process.env.GROQ_MAX_REQUEST_TOKENS || undefined,
    GROQ_BASE_URL: process.env.GROQ_BASE_URL || undefined,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || undefined,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || undefined,
    CLOUDFLARE_MODEL_FAST: process.env.CLOUDFLARE_MODEL_FAST || undefined,
    CLOUDFLARE_MODEL_STRONG: process.env.CLOUDFLARE_MODEL_STRONG || undefined,
    CLOUDFLARE_VISION_MODEL: process.env.CLOUDFLARE_VISION_MODEL || undefined,
    CLOUDFLARE_AI_BASE_URL: process.env.CLOUDFLARE_AI_BASE_URL || undefined,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || undefined,
    OLLAMA_MODEL_FAST: process.env.OLLAMA_MODEL_FAST || undefined,
    OLLAMA_MODEL_STRONG: process.env.OLLAMA_MODEL_STRONG || undefined,
    OLLAMA_CONTEXT_TOKENS: process.env.OLLAMA_CONTEXT_TOKENS || undefined,
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

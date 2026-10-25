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

/** True for URLs that point at this machine (localhost, 127.0.0.1, [::1], *.localhost). */
export function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** https anywhere, or http only to this machine, so API keys never travel in clear text. */
export function isSecureEndpoint(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || (protocol === "http:" && isLoopbackUrl(value));
  } catch {
    return false;
  }
}

/** An API base URL override that will carry a secret key. */
const keyedEndpoint = (name: string) => z.url().refine(isSecureEndpoint, `${name} must start with https:// (http:// is allowed only for localhost)`);

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
  AI_PROVIDER: z.enum(["auto", "groq", "cloudflare", "ollama_cloud", "ollama", "anthropic", "openai", "google", "mock"]).optional(),
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
  GROQ_BASE_URL: keyedEndpoint("GROQ_BASE_URL").optional(),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[a-f0-9]{32}$/i, "CLOUDFLARE_ACCOUNT_ID must be the 32-character account ID from the Cloudflare dashboard")
    .optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_MODEL_FAST: z.string().min(1).optional(),
  CLOUDFLARE_MODEL_STRONG: z.string().min(1).optional(),
  CLOUDFLARE_VISION_MODEL: z.string().min(1).optional(),
  CLOUDFLARE_AI_BASE_URL: keyedEndpoint("CLOUDFLARE_AI_BASE_URL").optional(),
  // Ollama Cloud (ollama.com): a backup whose free monthly allowance every student shares, so it has token budgets.
  OLLAMA_API_KEY: z.string().min(1).optional(),
  OLLAMA_CLOUD_BASE_URL: keyedEndpoint("OLLAMA_CLOUD_BASE_URL").optional(),
  OLLAMA_CLOUD_MODEL_FAST: z.string().min(1).optional(),
  OLLAMA_CLOUD_MODEL_STRONG: z.string().min(1).optional(),
  OLLAMA_CLOUD_LIMITS: z.string().min(1).optional(),
  // Your own Ollama server (no key, no budget).
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL_FAST: z.string().min(1).optional(),
  OLLAMA_MODEL_STRONG: z.string().min(1).optional(),
  OLLAMA_CONTEXT_TOKENS: z.coerce.number().int().min(1000).max(10_000_000).optional(),
  // Azure AI Speech: Filipino text-to-speech when the browser has no Filipino voice.
  AZURE_SPEECH_KEY: z.string().min(1).optional(),
  AZURE_SPEECH_REGION: z
    .string()
    .regex(/^[a-z0-9]{2,30}$/, "AZURE_SPEECH_REGION must be a region name such as southeastasia")
    .optional(),
  AZURE_TTS_VOICE: z
    .string()
    .regex(/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+Neural$/, "AZURE_TTS_VOICE must be a neural voice name such as fil-PH-BlessicaNeural")
    .optional(),
  AZURE_TTS_BASE_URL: keyedEndpoint("AZURE_TTS_BASE_URL").optional(),
  // Google Calendar (opt-in sync to a "RevTaw Study" calendar), official OAuth only.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  /** 32 random bytes, base64 (`openssl rand -base64 32`): encrypts Google refresh tokens at rest. */
  CALENDAR_TOKEN_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "CALENDAR_TOKEN_KEY must be 32 random bytes in base64 (openssl rand -base64 32)")
    .optional(),
  /** Tests only: one origin standing in for accounts.google.com, oauth2.googleapis.com and the Calendar API. */
  GOOGLE_API_BASE_URL: z
    .url()
    .refine(isLoopbackUrl, "GOOGLE_API_BASE_URL is for local tests only and must point at localhost; leave it unset in production")
    .optional(),
  // Product analytics (PostHog Cloud EU), only for students who opt in.
  POSTHOG_KEY: z.string().min(1).optional(),
  POSTHOG_HOST: keyedEndpoint("POSTHOG_HOST").optional(),
  // Cloudflare Turnstile on the sign-up, sign-in, reset and resend forms (optional; set both or neither).
  // The site key is public: it goes to the browser with those pages. The secret key stays on the server.
  TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  /** Tests only: a stand-in for Cloudflare's siteverify endpoint. */
  TURNSTILE_VERIFY_URL: z
    .url()
    .refine(isLoopbackUrl, "TURNSTILE_VERIFY_URL is for local tests only and must point at localhost; leave it unset in production")
    .optional(),
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
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY?.trim() || undefined,
    OLLAMA_CLOUD_BASE_URL: process.env.OLLAMA_CLOUD_BASE_URL || undefined,
    OLLAMA_CLOUD_MODEL_FAST: process.env.OLLAMA_CLOUD_MODEL_FAST || undefined,
    OLLAMA_CLOUD_MODEL_STRONG: process.env.OLLAMA_CLOUD_MODEL_STRONG || undefined,
    OLLAMA_CLOUD_LIMITS: process.env.OLLAMA_CLOUD_LIMITS || undefined,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || undefined,
    OLLAMA_MODEL_FAST: process.env.OLLAMA_MODEL_FAST || undefined,
    OLLAMA_MODEL_STRONG: process.env.OLLAMA_MODEL_STRONG || undefined,
    OLLAMA_CONTEXT_TOKENS: process.env.OLLAMA_CONTEXT_TOKENS || undefined,
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || undefined,
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || undefined,
    AZURE_TTS_VOICE: process.env.AZURE_TTS_VOICE || undefined,
    AZURE_TTS_BASE_URL: process.env.AZURE_TTS_BASE_URL || undefined,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
    CALENDAR_TOKEN_KEY: process.env.CALENDAR_TOKEN_KEY || undefined,
    GOOGLE_API_BASE_URL: process.env.GOOGLE_API_BASE_URL || undefined,
    POSTHOG_KEY: process.env.POSTHOG_KEY || undefined,
    POSTHOG_HOST: process.env.POSTHOG_HOST || undefined,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY?.trim() || undefined,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY?.trim() || undefined,
    TURNSTILE_VERIFY_URL: process.env.TURNSTILE_VERIFY_URL || undefined,
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

/**
 * The public address for links that leave the app (emails, calendar
 * events): NEXT_PUBLIC_SITE_URL, else Vercel's production domain, else
 * localhost while developing. Null in production without either, so an
 * email never links to localhost; those links are left out instead.
 */
export function getPublicSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;
  if (process.env.NODE_ENV !== "production") return getSiteUrl();
  return null;
}

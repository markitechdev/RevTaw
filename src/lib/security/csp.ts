const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Content Security Policy for every HTML response.
 *
 * Scripts are allowed only with the per-request nonce (plus anything those
 * scripts load, via 'strict-dynamic'), which blocks injected inline scripts
 * even if an XSS bug slips through. Styles allow inline values because React
 * style attributes and theme switching rely on them.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseOrigins = supabaseConnectOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Only ask browsers to upgrade http → https when the site itself is served
  // over TLS; otherwise a production build served locally would break.
  const servedOverTls = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
  // Cloudflare Turnstile (src/lib/security/turnstile.ts) runs its check in a frame from this origin. Its script is
  // already allowed by 'strict-dynamic'; the origin is listed too for browsers that predate 'strict-dynamic'.
  const turnstile = process.env.TURNSTILE_SITE_KEY?.trim() ? ` ${TURNSTILE_ORIGIN}` : "";

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabaseOrigins.http ? ` ${supabaseOrigins.http}` : ""}`,
    // Filipino answers read by the server play from blob: URLs; a data: clip unlocks audio on iPhone.
    "media-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigins.http ? ` ${supabaseOrigins.http} ${supabaseOrigins.ws}` : ""}${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    `frame-src 'self' blob:${turnstile}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev && servedOverTls) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function supabaseConnectOrigins(url: string | undefined): { http?: string; ws?: string } {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return {
      http: parsed.origin,
      ws: `${wsProtocol}//${parsed.host}`,
    };
  } catch {
    return {};
  }
}

/**
 * The policy for a material's original file: whatever renders it (the
 * browser's PDF viewer, an image, a text file in RevTaw's sandboxed frame)
 * runs with nothing else allowed, and only RevTaw itself may frame it.
 */
export const FILE_RESPONSE_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'";

/** Routes that send their own Content-Security-Policy, which the proxy must not replace with the page policy. */
export function hasOwnContentSecurityPolicy(pathname: string): boolean {
  return /^\/api\/materials\/[^/]+\/file\/?$/.test(pathname);
}

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

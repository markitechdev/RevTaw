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

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabaseOrigins.http ? ` ${supabaseOrigins.http}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigins.http ? ` ${supabaseOrigins.http} ${supabaseOrigins.ws}` : ""}${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
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

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

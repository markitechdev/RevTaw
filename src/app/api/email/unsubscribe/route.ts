import { z } from "zod";

import { escapeHtml } from "@/lib/reminders/message";
import { UNSUBSCRIBE_KINDS, verifyUnsubscribe, type UnsubscribeKind } from "@/lib/notifications/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  u: z.uuid(),
  k: z.enum(UNSUBSCRIBE_KINDS as [UnsubscribeKind, ...UnsubscribeKind[]]),
  t: z.string().min(20).max(100),
});

const WHAT: Record<UnsubscribeKind, { name: string; setting: "email" | "digest" }> = {
  reminders: { name: "reminder emails", setting: "email" },
  digest: { name: "the daily study digest", setting: "digest" },
};

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · RevTaw</title></head>
<body style="margin:0;background:#f7f6fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1530">
<main style="max-width:440px;margin:0 auto;padding:48px 24px">
<p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6d3fdc">RevTaw</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${escapeHtml(title)}</h1>
${body}
</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function parse(url: URL) {
  return paramsSchema.safeParse({ u: url.searchParams.get("u"), k: url.searchParams.get("k"), t: url.searchParams.get("t") });
}

const invalid = () => page("This link doesn't work", `<p style="font-size:15px;color:#4b4563">The unsubscribe link is incomplete or has expired. Turn emails off in RevTaw → Settings → Notifications instead.</p>`, 400);

/**
 * The page an unsubscribe link opens. Link scanners open links too, so GET
 * only asks; the button (or a mail app's one-click POST) turns emails off.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parse(url);
  if (!params.success || !verifyUnsubscribe(params.data.u, params.data.k, params.data.t)) return invalid();
  const what = WHAT[params.data.k];
  return page(
    `Stop ${what.name}?`,
    `<p style="font-size:15px;color:#4b4563">RevTaw will stop sending ${escapeHtml(what.name)} to this account. Reminders in the app keep working, and you can turn email back on in Settings → Notifications.</p>
<form method="post" action="${escapeHtml(url.pathname + url.search)}"><button type="submit" style="font:inherit;font-weight:600;background:#6d3fdc;color:#fff;border:0;border-radius:10px;padding:10px 16px;cursor:pointer">Stop ${escapeHtml(what.name)}</button></form>`,
  );
}

/** Turns the email off (the button above, or RFC 8058 one-click from a mail app). */
export async function POST(request: Request) {
  const params = parse(new URL(request.url));
  if (!params.success || !verifyUnsubscribe(params.data.u, params.data.k, params.data.t)) return invalid();
  const admin = createAdminClient();
  if (!admin) return page("Try again later", `<p style="font-size:15px;color:#4b4563">RevTaw couldn't change your email settings right now.</p>`, 503);

  const { data: profile } = await admin.from("profiles").select("preferences").eq("id", params.data.u).maybeSingle();
  if (profile) {
    const preferences = (profile.preferences ?? {}) as Record<string, unknown>;
    const notifications = (preferences.notifications && typeof preferences.notifications === "object" ? preferences.notifications : {}) as Record<string, unknown>;
    const next = { ...preferences, notifications: { ...notifications, [WHAT[params.data.k].setting]: false } };
    const { error } = await admin.from("profiles").update({ preferences: next as Json }).eq("id", params.data.u);
    if (error) {
      console.error("email: unsubscribe failed", error.message);
      return page("Try again later", `<p style="font-size:15px;color:#4b4563">RevTaw couldn't change your email settings right now.</p>`, 500);
    }
  }
  return page("You're unsubscribed", `<p style="font-size:15px;color:#4b4563">RevTaw won't send ${escapeHtml(WHAT[params.data.k].name)} anymore. Change this any time in Settings → Notifications.</p>`);
}

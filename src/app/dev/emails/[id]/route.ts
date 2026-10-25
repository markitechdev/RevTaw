import { EMAIL_SAMPLES } from "@/lib/email/samples";
import { getPublicSiteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Development only: one email exactly as it is sent (`?format=text` for its plain-text part). */
export async function GET(request: Request, context: RouteContext<"/dev/emails/[id]">) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const { id } = await context.params;
  const sample = EMAIL_SAMPLES.find((item) => item.id === id);
  if (!sample) return new Response("Not found", { status: 404 });
  const email = sample.render(getPublicSiteUrl());
  const text = new URL(request.url).searchParams.get("format") === "text";
  if (text && email.text !== null) return new Response(email.text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new Response(email.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

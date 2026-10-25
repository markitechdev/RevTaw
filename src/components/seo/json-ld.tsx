import { jsonLdText } from "@/lib/seo";

/**
 * Structured data for search engines, as Next's JSON-LD guide recommends: a data script that browsers never
 * run, so the page's script nonce doesn't apply. The values come from RevTaw's own constants, escaped.
 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}

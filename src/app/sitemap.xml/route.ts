import { connection } from "next/server";
import { absoluteUrl } from "@/lib/seo/metadata";
import { xmlEscape, xmlResponse } from "@/lib/seo/xml";
import { articleSitemapCount } from "@/server/services/sitemaps";

/** Sitemap index: the pages sitemap and the article sitemaps of each edition. */
export async function GET() {
  await connection();
  const files = ["/sitemaps/pages.xml"];
  for (const locale of ["si", "en"] as const) {
    const parts = await articleSitemapCount(locale);
    for (let i = 1; i <= parts; i++) files.push(`/sitemaps/articles-${locale}-${i}.xml`);
  }
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    files.map((f) => `  <sitemap><loc>${xmlEscape(absoluteUrl(f))}</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`;
  return xmlResponse(body);
}

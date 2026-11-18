import { connection } from "next/server";
import { absoluteUrl } from "@/lib/seo/metadata";
import { xmlEscape, xmlResponse } from "@/lib/seo/xml";
import { newsSitemap } from "@/server/services/sitemaps";

/**
 * Google News sitemap: articles first published in the last two days, with the
 * publication name, language (ISO 639: si, en) and original publication time.
 * It may be empty when nothing was published recently; that is allowed.
 */
export async function GET() {
  await connection();
  const { publication, items } = await newsSitemap();
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
    items
      .map(
        (i) =>
          `  <url>\n    <loc>${xmlEscape(absoluteUrl(i.path))}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${xmlEscape(publication)}</news:name>\n        <news:language>${i.locale}</news:language>\n      </news:publication>\n      <news:publication_date>${i.publishedAt}</news:publication_date>\n      <news:title>${xmlEscape(i.title)}</news:title>\n    </news:news>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  // Short cache: new articles should appear quickly.
  return xmlResponse(body, 120);
}

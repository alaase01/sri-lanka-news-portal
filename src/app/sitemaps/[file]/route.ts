import { connection } from "next/server";
import { absoluteUrl } from "@/lib/seo/metadata";
import { xmlEscape, xmlResponse } from "@/lib/seo/xml";
import { articleSitemap, articleSitemapCount, pagesSitemap, type SitemapUrl } from "@/server/services/sitemaps";

/** /sitemaps/pages.xml and /sitemaps/articles-{si|en}-{n}.xml */
const ARTICLES = /^articles-(si|en)-([1-9][0-9]{0,3})\.xml$/;

function urlset(urls: SitemapUrl[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${xmlEscape(absoluteUrl(u.path))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  await connection();
  const { file } = await params;
  if (file === "pages.xml") return xmlResponse(urlset(await pagesSitemap()));
  const m = ARTICLES.exec(file);
  if (m) {
    const locale = m[1] as "si" | "en";
    const part = Number(m[2]);
    if (part <= (await articleSitemapCount(locale))) return xmlResponse(urlset(await articleSitemap(locale, part)));
  }
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

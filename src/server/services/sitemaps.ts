import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { locales, type Locale } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/seo/metadata";
import { articleHref, getCategoryIndex, publicPollWhere, publicVideoWhere, publishedWhere } from "./content";

/**
 * Data for the XML sitemaps. Everything goes through the same filters as the
 * public pages (published, or scheduled with the time passed; not deleted), and
 * every URL is the page's canonical address. Cached and invalidated with the
 * same tags as the pages, so publishing, unpublishing or deleting an article
 * updates the sitemaps too.
 */

export type SitemapUrl = { path: string; lastmod?: string };

/** URLs per article sitemap file; the protocol allows 50,000. */
export const ARTICLES_PER_SITEMAP = 10_000;
/** Google News: at most 1,000 articles, from the last two days. */
export const NEWS_MAX = 1_000;
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function articleSitemapCount(locale: Locale): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles");
  const n = await db.articleTranslation.count({ where: publishedWhere(locale, new Date()) });
  return Math.max(1, Math.ceil(n / ARTICLES_PER_SITEMAP));
}

export async function articleSitemap(locale: Locale, part: number): Promise<SitemapUrl[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "categories");
  const rows = await db.articleTranslation.findMany({
    where: publishedWhere(locale, new Date()),
    orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
    skip: (part - 1) * ARTICLES_PER_SITEMAP,
    take: ARTICLES_PER_SITEMAP,
    select: { slug: true, publishedAt: true, modifiedAt: true, scheduledAt: true, createdAt: true, article: { select: { primaryCategoryId: true } } },
  });
  const byId = new Map((await getCategoryIndex(locale)).map((c) => [c.id, c]));
  return rows.map((r) => ({
    path: articleHref(locale, byId.get(r.article.primaryCategoryId), r.slug),
    // The last significant edit, or the publication time. Never the time the sitemap was made.
    lastmod: (r.modifiedAt ?? r.publishedAt ?? r.scheduledAt ?? r.createdAt).toISOString(),
  }));
}

/** Home pages, sections, static pages, the video and poll pages. */
export async function pagesSitemap(): Promise<SitemapUrl[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("categories", "pages", "videos", "polls");
  const now = new Date();
  const out: SitemapUrl[] = [];
  for (const locale of locales) {
    out.push({ path: `/${locale}` });
    for (const c of await getCategoryIndex(locale)) out.push({ path: c.href });

    const pages = await db.staticPageTranslation.findMany({
      where: { locale, isPublished: true },
      orderBy: { page: { sortOrder: "asc" } },
      select: { publishedAt: true, page: { select: { slug: true } } },
    });
    for (const p of pages) out.push({ path: `/${locale}/${p.page.slug}`, lastmod: p.publishedAt?.toISOString() });

    out.push({ path: `/${locale}/videos` });
    const videos = await db.videoTranslation.findMany({
      where: { locale, slug: { not: null }, video: publicVideoWhere(locale, now) },
      orderBy: { video: { publishedAt: "desc" } },
      take: 5_000,
      select: { slug: true, video: { select: { publishedAt: true } } },
    });
    for (const v of videos) out.push({ path: `/${locale}/videos/${v.slug}`, lastmod: v.video.publishedAt?.toISOString() });

    out.push({ path: `/${locale}/public-opinions` });
    const polls = await db.poll.findMany({
      where: { ...publicPollWhere, translations: { some: { locale } } },
      orderBy: { startsAt: "desc" },
      take: 5_000,
      select: { slug: true },
    });
    for (const p of polls) out.push({ path: `/${locale}/public-opinions/${p.slug}` });
  }
  return out;
}

export type NewsItem = { path: string; locale: Locale; title: string; publishedAt: string };

/**
 * Articles first published in the last 48 hours, newest first. Uses the original
 * publication time, so an edited old article never reappears as new.
 */
export async function newsSitemap(): Promise<{ publication: string; items: NewsItem[] }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "categories");
  const now = new Date();
  const since = new Date(now.getTime() - NEWS_WINDOW_MS);
  const items: NewsItem[] = [];
  for (const locale of locales) {
    const rows = await db.articleTranslation.findMany({
      where: { ...publishedWhere(locale, now), publishedAt: { gte: since, lte: now } },
      orderBy: { publishedAt: "desc" },
      take: NEWS_MAX,
      select: { slug: true, headline: true, publishedAt: true, article: { select: { primaryCategoryId: true } } },
    });
    const byId = new Map((await getCategoryIndex(locale)).map((c) => [c.id, c]));
    for (const r of rows) {
      items.push({ path: articleHref(locale, byId.get(r.article.primaryCategoryId), r.slug), locale, title: r.headline, publishedAt: r.publishedAt!.toISOString() });
    }
  }
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { publication: SITE_NAME, items: items.slice(0, NEWS_MAX) };
}

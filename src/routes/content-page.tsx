import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/utils/dates";
import { absoluteUrl, alternates } from "@/lib/seo/metadata";
import {
  getArticlePage,
  getCategoryIndex,
  getCategoryPage,
  getRedirectHref,
  getRootCategoryPaths,
  type ArticlePageData,
  type CategoryPageData,
} from "@/server/services/content";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";
import { ArticleBody } from "@/components/article/ArticleBody";
import { ShareBar } from "@/components/article/ShareBar";
import { Wordmark } from "@/components/layout/Wordmark";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { AdSlot } from "@/components/ads/AdSlot";
import { ArticleFeed, ArticleGrid } from "@/components/news/ArticleCards";
import { SectionHeading } from "@/components/news/SectionHeading";
import { Pagination } from "@/components/news/Pagination";

/**
 * Handles every URL of the form /{locale}/{...path}: category pages
 * (/si/politics/parliament) and article pages (/si/politics/parliament/some-slug).
 */

export type ContentProps = { params: Promise<{ path: string[] }> };

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,119}$/;

function isValidPath(path: string[]): boolean {
  return path.length >= 1 && path.length <= 6 && path.every((s) => SEGMENT.test(s));
}

/** Page number from a trailing "/page/N" pair, or null when the pair is malformed. */
export function parsePageNumber(value: string): number | null {
  if (!/^[1-9][0-9]{0,2}$/.test(value)) return null;
  return Number(value);
}

/**
 * Listing pages are paginated in the path (/si/politics/page/2), not the query
 * string, so every page is a distinct cacheable URL. "page" is therefore a
 * reserved word that no category or article slug may use.
 */
function splitPage(path: string[]): { base: string[]; page: number } | null {
  const i = path.length - 2;
  if (i >= 1 && path[i] === "page") {
    const page = parsePageNumber(path[i + 1]);
    // Page 1 has no suffix; "/page/1" is not a second address for it.
    return page && page > 1 ? { base: path.slice(0, i), page } : null;
  }
  return { base: path, page: 1 };
}

/** Cache Components needs at least one known path per edition to validate the route at build time. */
export async function contentStaticParams(locale: Locale): Promise<{ path: string[] }[]> {
  const paths = await getRootCategoryPaths(locale);
  return paths.length > 0 ? paths.map((path) => ({ path })) : [{ path: ["-"] }];
}

async function isCategoryPath(locale: Locale, path: string[]): Promise<boolean> {
  const key = path.join("/");
  return (await getCategoryIndex(locale)).some((c) => c.path.join("/") === key);
}

export async function contentMetadata(locale: Locale, props: ContentProps): Promise<Metadata> {
  const { path } = await props.params;
  if (!isValidPath(path)) return {};

  const split = splitPage(path);
  if (split && (await isCategoryPath(locale, split.base))) {
    const data = await getCategoryPage(locale, split.base, split.page);
    if (!data) return {};
    return {
      title: data.category.name,
      description: data.category.description ?? undefined,
      alternates: {
        canonical: split.page > 1 ? `${data.category.href}/page/${split.page}` : data.category.href,
      },
    };
  }

  const article = await getArticlePage(locale, path[path.length - 1]);
  if (!article) return {};
  const description = article.metaDescription ?? article.summary;
  return {
    title: article.seoTitle ?? article.headline,
    description,
    alternates: alternates(locale, article.href, article.alternate?.href ?? null),
    openGraph: {
      type: "article",
      title: article.headline,
      description,
      url: article.href,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      ...(article.image ? { images: [{ url: absoluteUrl(mediaUrl(article.image.storageKey, 1600)), alt: article.image.alt }] } : {}),
    },
    twitter: article.image
      ? { card: "summary_large_image", title: article.headline, description, images: [absoluteUrl(mediaUrl(article.image.storageKey, 1600))] }
      : { card: "summary", title: article.headline, description },
  };
}

export async function ContentPage({ locale, params }: ContentProps & { locale: Locale }) {
  const { path } = await params;
  if (!isValidPath(path)) notFound();

  const split = splitPage(path);
  if (split && (await isCategoryPath(locale, split.base))) {
    const data = await getCategoryPage(locale, split.base, split.page);
    // A page past the end is a 404, not an empty listing.
    if (!data || (split.page > 1 && data.articles.length === 0)) notFound();
    return <CategoryView locale={locale} data={data} />;
  }

  const slug = path[path.length - 1];
  const article = await getArticlePage(locale, slug);
  if (!article) {
    const moved = await getRedirectHref(locale, slug);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  // One URL per article: any other category prefix redirects to the canonical path.
  if (article.href !== `/${locale}/${path.join("/")}`) permanentRedirect(article.href);
  return <ArticleView locale={locale} article={article} />;
}

function CategoryView({ locale, data }: { locale: Locale; data: CategoryPageData }) {
  const t = getDictionary(locale);
  return (
    <div className="flex flex-col gap-5">
      <AdSlot slot="top" label={t.advertisement} />
      <Breadcrumbs crumbs={data.crumbs.slice(0, -1)} homeHref={`/${locale}`} homeLabel={t.home} />
      <header className="border-l-[5px] border-brand pl-3">
        <h1 className="text-3xl font-bold leading-snug">{data.category.name}</h1>
        {data.category.description && <p className="mt-1 text-body">{data.category.description}</p>}
      </header>

      {data.children.length > 0 && (
        <nav aria-label={t.categories}>
          <ul className="flex flex-wrap gap-2">
            {data.children.map((c) => (
              <li key={c.id}>
                <Link href={c.href} className="flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold hover:text-brand-dark">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {data.articles.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-body">{t.noArticles}</p>
      ) : (
        <ArticleFeed articles={data.articles} locale={locale} adLabel={t.advertisement} />
      )}

      <Pagination basePath={data.category.href} page={data.page} hasNext={data.hasNext} labels={{ newer: t.newerNews, older: t.olderNews }} />
    </div>
  );
}

function ArticleView({ locale, article }: { locale: Locale; article: ArticlePageData }) {
  const t = getDictionary(locale);
  const showUpdated = new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() > 60_000;
  const category = article.crumbs.at(-1);
  const fullUrl = absoluteUrl(article.href);
  // Copyright year of the article itself, so cached pages never need the current date.
  const year = article.publishedAt.slice(0, 4);
  return (
    <div className="flex flex-col gap-8">
      <AdSlot slot="top" label={t.advertisement} />
      <article className="mx-auto w-full max-w-3xl rounded-lg bg-white px-4 py-6 sm:px-8 sm:py-8">
        {/* Brand strip: sits directly above the headline so screenshots of it carry the brand. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-navy pb-2.5">
          <Link href={`/${locale}`} aria-label={`RSnewslk.com — ${t.home}`}>
            <Wordmark tone="light" className="text-[20px] leading-none sm:text-[22px]" />
          </Link>
          {category && (
            <Link href={category.href} className="rounded-sm bg-brand px-2.5 py-0.5 text-[13px] font-semibold text-white hover:bg-brand-dark">
              {category.name}
            </Link>
          )}
        </div>
        <div className="mt-3">
          <Breadcrumbs crumbs={article.crumbs} homeHref={`/${locale}`} homeLabel={t.home} />
        </div>
        <h1 className="mt-4 text-[28px] font-bold leading-[1.45] sm:text-4xl sm:leading-[1.4]">{article.headline}</h1>
        {article.summary && <p className="mt-3 text-lg leading-relaxed text-body">{article.summary}</p>}

        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-line py-3 text-sm text-muted">
          {article.authorName && <span className="font-semibold text-ink">{article.authorName}</span>}
          <span>
            {t.published}: <time dateTime={article.publishedAt}>{formatDateTime(article.publishedAt, locale)}</time>
          </span>
          {showUpdated && (
            <span>
              {t.updated}: <time dateTime={article.updatedAt}>{formatDateTime(article.updatedAt, locale)}</time>
            </span>
          )}
        </p>

        {article.image && (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP with srcset */}
            <img
              src={mediaUrl(article.image.storageKey, 960)}
              srcSet={mediaSrcSet(article.image.storageKey, article.image.width)}
              sizes="(min-width: 1024px) 760px, 100vw"
              width={article.image.width}
              height={article.image.height}
              alt={article.image.alt}
              fetchPriority="high"
              className="h-auto w-full rounded-md bg-placeholder"
            />
            {(article.image.caption || article.image.credit) && (
              <figcaption className="mt-2 text-sm text-muted">
                {article.image.caption}
                {article.image.caption && article.image.credit ? " · " : ""}
                {article.image.credit && <span>{t.photo}: {article.image.credit}</span>}
              </figcaption>
            )}
          </figure>
        )}

        <div className="mt-6">
          <ArticleBody body={article.body} inset={<AdSlot slot="in-article" label={t.advertisement} />} />
        </div>

        {/* Source line: attribution at the end of the text, for screenshots of the lower part. */}
        <p className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-navy pt-3 text-[13px] text-muted">
          <span className="flex items-center gap-2">
            <Wordmark tone="light" className="text-[15px]" />
            <span className="font-latin">© {year} RSnewslk.com</span>
          </span>
          <span className="min-w-0 max-w-full truncate font-latin" title={fullUrl}>
            {fullUrl.replace(/^https?:\/\//, "")}
          </span>
        </p>

        <div className="mt-5 border-t border-line pt-5">
          <ShareBar
            url={fullUrl}
            title={article.headline}
            summary={article.summary}
            labels={{
              share: t.share,
              copyLink: t.copyLink,
              linkCopied: t.linkCopied,
              copyFailed: t.copyFailed,
              shareMore: t.shareMore,
              shareOn: t.shareOn,
            }}
          />
        </div>

        {article.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <span className="text-sm font-semibold text-muted">{t.tags}:</span>
            <ul className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <li key={tag.href}>
                  <Link href={tag.href} className="flex min-h-9 items-center rounded-full bg-soft px-3 text-sm font-medium hover:text-brand-dark">
                    {tag.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      {article.related.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading title={t.related} />
          <ArticleGrid articles={article.related} locale={locale} />
        </section>
      )}
    </div>
  );
}

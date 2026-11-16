import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getTagPage, getTagSlugs } from "@/server/services/content";
import { AdSlot } from "@/components/ads/AdSlot";
import { ArticleFeed } from "@/components/news/ArticleCards";
import { Pagination } from "@/components/news/Pagination";
import { parsePageNumber } from "./content-page";

/** /{locale}/tag/{slug} and /{locale}/tag/{slug}/page/{n} */
export type TagProps = { params: Promise<{ slug: string; page?: string[] }> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

function resolve(slug: string, rest: string[] | undefined): { slug: string; page: number } | null {
  if (!SLUG.test(slug)) return null;
  if (!rest || rest.length === 0) return { slug, page: 1 };
  if (rest.length !== 2 || rest[0] !== "page") return null;
  const page = parsePageNumber(rest[1]);
  return page && page > 1 ? { slug, page } : null;
}

export async function tagStaticParams(locale: Locale): Promise<{ slug: string; page: string[] }[]> {
  const slugs = await getTagSlugs(locale);
  return (slugs.length > 0 ? slugs : ["-"]).map((slug) => ({ slug, page: [] }));
}

export async function tagMetadata(locale: Locale, props: TagProps): Promise<Metadata> {
  const { slug, page } = await props.params;
  const target = resolve(slug, page);
  if (!target) return {};
  const data = await getTagPage(locale, target.slug, target.page);
  if (!data) return {};
  return {
    title: data.tag.name,
    alternates: { canonical: target.page > 1 ? `${data.tag.href}/page/${target.page}` : data.tag.href },
  };
}

export async function TagPage({ locale, params }: TagProps & { locale: Locale }) {
  const { slug, page } = await params;
  const target = resolve(slug, page);
  if (!target) notFound();
  const data = await getTagPage(locale, target.slug, target.page);
  if (!data || (target.page > 1 && data.articles.length === 0)) notFound();
  const t = getDictionary(locale);

  return (
    <div className="flex flex-col gap-5">
      <AdSlot slot="top" label={t.advertisement} />
      <header className="border-l-[5px] border-brand pl-3">
        <p className="text-sm font-semibold text-muted">{t.tag}</p>
        <h1 className="text-3xl font-bold leading-snug">{data.tag.name}</h1>
      </header>
      {data.articles.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-body">{t.noArticles}</p>
      ) : (
        <ArticleFeed articles={data.articles} locale={locale} adLabel={t.advertisement} />
      )}
      <Pagination basePath={data.tag.href} page={data.page} hasNext={data.hasNext} labels={{ newer: t.newerNews, older: t.olderNews }} />
    </div>
  );
}

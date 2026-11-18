import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatDate } from "@/lib/utils/dates";
import { alternates } from "@/lib/seo/metadata";
import { socialMetadata } from "@/lib/seo/site";
import { getStaticPage, type StaticPageSlug } from "@/server/services/pages";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { StaticPageContent } from "@/components/pages/StaticPageContent";
import { bodyText } from "@/lib/content/body";

/**
 * About, Contact and policy pages: /{locale}/{slug}. Only the published copy is
 * shown. A page published only in the other language shows a short notice with
 * a link to it, and is kept out of search engines.
 */

const path = (locale: Locale, slug: string) => `/${locale}/${slug}`;

export async function staticPageMetadata(locale: Locale, slug: StaticPageSlug): Promise<Metadata> {
  const page = await getStaticPage(locale, slug);
  if (!page) return {};
  if (page.kind === "otherLanguageOnly") {
    return { title: page.otherTitle, robots: { index: false, follow: true } };
  }
  const description = page.metaDescription || bodyText(page.body).slice(0, 160);
  return {
    title: page.seoTitle || page.title,
    description,
    alternates: alternates(locale, path(locale, slug), page.otherPublished ? path(otherLocale(locale), slug) : null),
    ...(await socialMetadata({ locale, title: page.seoTitle || page.title, description, path: path(locale, slug), hasAlternate: page.otherPublished })),
  };
}

export async function StaticPageRoute({ locale, slug }: { locale: Locale; slug: StaticPageSlug }) {
  const page = await getStaticPage(locale, slug);
  if (!page) notFound();
  const t = getDictionary(locale);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-lg bg-white px-4 py-6 sm:px-8 sm:py-8">
      {page.kind === "page" ? (
        <>
          <Breadcrumbs crumbs={[{ name: page.title, href: path(locale, slug) }]} homeHref={`/${locale}`} homeLabel={t.home} />
          <StaticPageContent
            title={page.title}
            body={page.body}
            locale={locale}
            updatedLabel={page.publishedAt ? `${t.lastUpdated}: ${formatDate(page.publishedAt.toISOString(), locale)}` : null}
          />
        </>
      ) : (
        <div className="flex flex-col gap-4 py-6">
          <p className="text-lg">{t.pageNotTranslated}</p>
          <p>
            <Link href={path(otherLocale(locale), slug)} lang={otherLocale(locale)} className="font-semibold text-navy underline">
              {t.readInOtherLanguage}: {page.otherTitle}
            </Link>
          </p>
        </div>
      )}
    </article>
  );
}

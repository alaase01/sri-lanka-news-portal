import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/config";
import { otherLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { alternates } from "@/lib/seo/metadata";
import { getHomepage } from "@/server/services/content";
import { ArticleHeadline, ArticleRow, ArticleTile } from "@/components/news/ArticleCards";
import { HeroCarousel } from "@/components/news/HeroCarousel";
import { LatestTabs } from "@/components/news/LatestTabs";
import { QuickCategories } from "@/components/news/QuickCategories";
import { SectionHeading } from "@/components/news/SectionHeading";
import { Ticker } from "@/components/news/Ticker";
import { VideoPanel } from "@/components/news/VideoPanel";

export function homeMetadata(locale: Locale): Metadata {
  return { alternates: alternates(locale, `/${locale}`, `/${otherLocale(locale)}`) };
}

export async function HomePage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const data = await getHomepage(locale);

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      {/* Phones: section chips come first, because they are the main navigation there. */}
      <QuickCategories categories={data.quickCategories} label={t.quickCategories} className="lg:hidden" />

      <Ticker items={data.breaking} label={t.breaking} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <HeroCarousel
          slides={data.hero}
          labels={{ featured: t.featured, readMore: t.readMore, previous: t.previous, next: t.next }}
        />
        <LatestTabs
          latest={data.latest}
          mostRead={data.mostRead}
          locale={locale}
          labels={{ latest: t.latest, mostRead: t.mostRead }}
        />
        <VideoPanel videos={data.videos} title={t.videoNews} />
      </div>

      {data.topStories.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading title={t.topStories} />
          {/* Phones get compact rows; full-width image cards would push everything else down. */}
          <ul className="divide-y divide-line rounded-lg bg-white px-4 sm:hidden">
            {data.topStories.map((a) => (
              <li key={a.id}>
                <ArticleRow article={a} locale={locale} />
              </li>
            ))}
          </ul>
          <ul className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {data.topStories.map((a) => (
              <li key={a.id} className="flex">
                <ArticleTile article={a} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.categoryBlocks.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {data.categoryBlocks.map(({ category, articles }) => (
            <section key={category.id} className="rounded-lg bg-white px-5 py-4">
              <div className="flex items-center justify-between border-b-2 border-navy pb-2">
                <h2 className="text-[19px] font-bold">{category.name}</h2>
                <a href={category.href} className="text-sm font-semibold text-brand-dark hover:underline">
                  {t.viewAll}
                  <span className="sr-only">: {category.name}</span>
                </a>
              </div>
              <ul className="divide-y divide-line">
                {articles.map((a) => (
                  <li key={a.id}>
                    <ArticleHeadline article={a} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <QuickCategories categories={data.quickCategories} label={t.quickCategories} className="hidden lg:block" />
    </div>
  );
}

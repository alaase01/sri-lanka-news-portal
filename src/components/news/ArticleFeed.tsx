import type { Locale } from "@/lib/i18n/config";
import type { ArticleCard } from "@/server/services/content";
import { AdSlot } from "@/components/ads/AdSlot";
import { ArticleGrid } from "./ArticleCards";

/*
 * Kept apart from ArticleCards.tsx: the ad slot reads the database, and
 * ArticleCards is also used inside client components.
 */

const FEED_AD_AFTER = 8;

/** A listing with an in-feed ad position after the eighth story, when there are more than eight. */
export function ArticleFeed({ articles, locale, adLabel }: { articles: ArticleCard[]; locale: Locale; adLabel: string }) {
  if (articles.length <= FEED_AD_AFTER) return <ArticleGrid articles={articles} locale={locale} />;
  return (
    <div className="flex flex-col gap-5">
      <ArticleGrid articles={articles.slice(0, FEED_AD_AFTER)} locale={locale} />
      <AdSlot slot="in-feed" label={adLabel} locale={locale} />
      <ArticleGrid articles={articles.slice(FEED_AD_AFTER)} locale={locale} />
    </div>
  );
}

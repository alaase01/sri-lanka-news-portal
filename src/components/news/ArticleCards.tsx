import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { ArticleCard } from "@/server/services/content";
import { Thumb } from "./Thumb";
import { TimeAgo } from "./TimeAgo";

/** Compact row: thumbnail, headline, time. */
export function ArticleRow({ article, locale }: { article: ArticleCard; locale: Locale }) {
  return (
    <Link href={article.href} className="group flex gap-3 py-3">
      <Thumb className="h-16 w-24 rounded" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold leading-snug group-hover:text-brand-dark">{article.headline}</span>
        <TimeAgo iso={article.publishedAt} locale={locale} className="text-[12.5px] text-muted" />
      </span>
    </Link>
  );
}

/** Card with image on top, headline, category and time. */
export function ArticleTile({ article, locale }: { article: ArticleCard; locale: Locale }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-md bg-white">
      <Link href={article.href} className="group flex flex-1 flex-col">
        <Thumb className="aspect-[16/9] w-full" />
        <span className="px-3.5 pt-3 font-semibold leading-snug group-hover:text-brand-dark">{article.headline}</span>
      </Link>
      <p className="flex flex-wrap items-center gap-x-2 px-3.5 pb-3.5 pt-2 text-[12.5px] text-muted">
        {article.categoryName && article.categoryHref && (
          <>
            <Link href={article.categoryHref} className="font-bold text-brand-dark hover:underline">
              {article.categoryName}
            </Link>
            <span aria-hidden="true">·</span>
          </>
        )}
        <TimeAgo iso={article.publishedAt} locale={locale} />
      </p>
    </article>
  );
}

/** Headline-only link used in category blocks. */
export function ArticleHeadline({ article }: { article: ArticleCard }) {
  return (
    <Link href={article.href} className="block py-3 font-semibold leading-snug hover:text-brand-dark">
      {article.headline}
    </Link>
  );
}

/** Listing used on category, tag and related sections: compact rows on phones, image cards from tablet up. */
export function ArticleGrid({ articles, locale }: { articles: ArticleCard[]; locale: Locale }) {
  return (
    <>
      <ul className="divide-y divide-line rounded-lg bg-white px-4 sm:hidden">
        {articles.map((a) => (
          <li key={a.id}>
            <ArticleRow article={a} locale={locale} />
          </li>
        ))}
      </ul>
      <ul className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((a) => (
          <li key={a.id} className="flex">
            <ArticleTile article={a} locale={locale} />
          </li>
        ))}
      </ul>
    </>
  );
}

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { cleanBody, emptyBody, type BodyDoc } from "@/lib/content/body";

/** The fixed set of static pages and their web addresses (the same in both languages). */
export const STATIC_PAGE_SLUGS = ["about", "contact", "privacy-policy", "terms-and-conditions", "editorial-policy"] as const;
export type StaticPageSlug = (typeof STATIC_PAGE_SLUGS)[number];

export type PublicStaticPage =
  | {
      kind: "page";
      key: string;
      title: string;
      body: BodyDoc;
      seoTitle: string;
      metaDescription: string;
      publishedAt: Date | null;
      /** The same page is published in the other language. */
      otherPublished: boolean;
    }
  /** Not published in this language, but published in the other. */
  | { kind: "otherLanguageOnly"; key: string; otherTitle: string };

/** The published copy of a static page; drafts are never returned. */
export async function getStaticPage(locale: Locale, slug: string): Promise<PublicStaticPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("pages");

  const page = await db.staticPage.findUnique({
    where: { slug },
    select: {
      key: true,
      translations: {
        where: { isPublished: true },
        select: { locale: true, publishedTitle: true, publishedBody: true, publishedSeoTitle: true, publishedMetaDescription: true, publishedAt: true },
      },
    },
  });
  if (!page) return null;
  const mine = page.translations.find((t) => t.locale === locale);
  const other = page.translations.find((t) => t.locale === otherLocale(locale));
  if (!mine) return other ? { kind: "otherLanguageOnly", key: page.key, otherTitle: other.publishedTitle ?? "" } : null;
  return {
    kind: "page",
    key: page.key,
    title: mine.publishedTitle ?? "",
    body: cleanBody(mine.publishedBody, { align: true }) ?? emptyBody(),
    seoTitle: mine.publishedSeoTitle ?? "",
    metaDescription: mine.publishedMetaDescription ?? "",
    publishedAt: mine.publishedAt,
    otherPublished: !!other,
  };
}

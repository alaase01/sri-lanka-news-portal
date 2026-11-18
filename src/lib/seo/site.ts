import "server-only";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { env } from "@/config/env";
import { languageTag, type Locale } from "@/lib/i18n/config";
import { SHARE_IMAGE, SHARE_MIN_SOURCE_WIDTH, shareImageUrl } from "@/lib/content/media";
import { absoluteUrl, SITE_NAME } from "./metadata";
import { socialProfiles } from "./social";

/**
 * Publication identity and social-sharing helpers shared by every public page:
 * Open Graph and X metadata, share images and the Organization structured data.
 */

/** Facebook locale codes. Facebook lists si_LK; it has no Sri Lankan English, so en_GB is used. */
export const OG_LOCALE: Record<Locale, string> = { si: "si_LK", en: "en_GB" };

export const LOGO = { path: "/brand/rsnewslk-logo-336.png", width: 336, height: 336 } as const;
const DEFAULT_SHARE = { path: "/brand/og-default.jpg", width: SHARE_IMAGE.width, height: SHARE_IMAGE.height } as const;

export type ShareImage = { url: string; width: number; height: number; alt: string; type: string };

type MediaLike = { storageKey: string; width: number; alt?: string | null } | null | undefined;

/** The 1200 × 630 share image for a page's own image, when it is large enough. */
export function ownShareImage(media: MediaLike): ShareImage | null {
  if (!media || media.width < SHARE_MIN_SOURCE_WIDTH) return null;
  return { url: absoluteUrl(shareImageUrl(media.storageKey)), width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, alt: media.alt ?? "", type: SHARE_IMAGE.type };
}

export type SeoSettings = { sameAs: string[]; defaultImage: ShareImage };

/** Social profiles and the default share image, from Admin → Settings. */
export async function getSeoSettings(): Promise<SeoSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings", "media");
  const s = await db.siteSettings.findUnique({ where: { id: 1 }, select: { socialLinks: true, defaultShareMediaId: true } });
  const media = s?.defaultShareMediaId
    ? await db.media.findUnique({ where: { id: s.defaultShareMediaId }, select: { storageKey: true, width: true } })
    : null;
  return {
    sameAs: socialProfiles(s?.socialLinks).map((p) => p.url),
    defaultImage: ownShareImage(media) ?? {
      url: absoluteUrl(DEFAULT_SHARE.path),
      width: DEFAULT_SHARE.width,
      height: DEFAULT_SHARE.height,
      alt: SITE_NAME,
      type: "image/jpeg",
    },
  };
}

type SocialInput = {
  locale: Locale;
  title: string;
  description?: string | null;
  /** Site-relative path of the canonical URL. Omitted in the layout's fallback, which serves many pages. */
  path?: string;
  type?: "website" | "article" | "video.other";
  image?: ShareImage | null;
  /** The page exists in the other language. */
  hasAlternate?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
};

/**
 * Complete Open Graph and X tags for a page. Next.js replaces (does not merge)
 * the layout's openGraph when a page sets its own, so every page that sets one
 * must use this to keep the site name, locale and image.
 */
export async function socialMetadata(input: SocialInput): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const image = input.image ?? (await getSeoSettings()).defaultImage;
  const other = input.locale === "si" ? "en" : "si";
  const description = input.description?.trim() || undefined;
  const images = [{ url: image.url, width: image.width, height: image.height, alt: image.alt || input.title, type: image.type }];
  const base = {
    siteName: SITE_NAME,
    locale: OG_LOCALE[input.locale],
    ...(input.hasAlternate ? { alternateLocale: [OG_LOCALE[other]] } : {}),
    title: input.title,
    description,
    ...(input.path ? { url: absoluteUrl(input.path) } : {}),
    images,
  };
  const openGraph: Metadata["openGraph"] =
    input.type === "article"
      ? { ...base, type: "article", publishedTime: input.publishedTime, modifiedTime: input.modifiedTime, section: input.section, tags: input.tags }
      : { ...base, type: input.type ?? "website" };
  return {
    openGraph,
    twitter: { card: "summary_large_image", title: input.title, description, images: [{ url: image.url, alt: image.alt || input.title }] },
  };
}

/** One identity for the publication, referenced by @id from every other block. */
export const ORGANIZATION_ID = `${env.SITE_URL}/#organization`;

export function organizationJsonLd(sameAs: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: `${env.SITE_URL}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl(LOGO.path), width: LOGO.width, height: LOGO.height },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function inLanguage(locale: Locale): string {
  return languageTag[locale];
}

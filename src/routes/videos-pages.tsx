import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { absoluteUrl, alternates } from "@/lib/seo/metadata";
import { formatDateTime } from "@/lib/utils/dates";
import { mediaUrl } from "@/lib/content/media";
import { getVideoList, getVideoPage, getVideoSlugs } from "@/server/services/content";
import { AdSlot } from "@/components/ads/AdSlot";
import { ShareBar } from "@/components/article/ShareBar";
import { Pagination } from "@/components/news/Pagination";
import { SectionHeading } from "@/components/news/SectionHeading";
import { YouTubePlayer } from "@/components/videos/YouTubePlayer";
import { VideoGrid } from "@/components/videos/VideoCards";
import { parsePageNumber } from "./content-page";

/** /{locale}/videos, /{locale}/videos/page/{n} and /{locale}/videos/{slug} */

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const base = (locale: Locale) => `/${locale}/videos`;

// ───────────────────────── list ─────────────────────────

export type VideoListProps = { params?: Promise<{ n: string }> };

async function pageFrom(props: VideoListProps): Promise<number | null> {
  if (!props.params) return 1;
  const n = parsePageNumber((await props.params).n);
  return n && n > 1 ? n : null;
}

export async function videoListMetadata(locale: Locale, props: VideoListProps): Promise<Metadata> {
  const t = getDictionary(locale);
  const page = await pageFrom(props);
  const path = page && page > 1 ? `${base(locale)}/page/${page}` : base(locale);
  return { title: t.videos, description: t.videosIntro, alternates: alternates(locale, path, page === 1 ? base(otherLocale(locale)) : null) };
}

export async function VideoListPage({ locale, ...props }: VideoListProps & { locale: Locale }) {
  const t = getDictionary(locale);
  const page = await pageFrom(props);
  if (!page) notFound();
  const data = await getVideoList(locale, page);
  if (page > 1 && data.videos.length === 0) notFound();
  return (
    <div className="flex flex-col gap-5">
      <AdSlot slot="top" label={t.advertisement} />
      <header className="border-l-[5px] border-brand pl-3">
        <h1 className="text-3xl font-bold leading-snug">{t.videos}</h1>
        <p className="mt-1 text-body">{t.videosIntro}</p>
      </header>
      {data.videos.length === 0 ? <p className="rounded-lg bg-white p-5 text-body">{t.noVideos}</p> : <VideoGrid videos={data.videos} />}
      <Pagination basePath={base(locale)} page={data.page} hasNext={data.hasNext} labels={{ newer: t.newerVideos, older: t.olderVideos }} />
    </div>
  );
}

// ───────────────────────── one video ─────────────────────────

export type VideoProps = { params: Promise<{ slug: string }> };

export async function videoStaticParams(locale: Locale): Promise<{ slug: string }[]> {
  const slugs = await getVideoSlugs(locale);
  return (slugs.length > 0 ? slugs : ["-"]).map((slug) => ({ slug }));
}

export async function videoMetadata(locale: Locale, props: VideoProps): Promise<Metadata> {
  const { slug } = await props.params;
  if (!SLUG.test(slug)) return {};
  const v = await getVideoPage(locale, slug);
  if (!v) return {};
  const description = v.metaDescription ?? (v.description.slice(0, 200) || getDictionary(locale).videosIntro);
  const image = v.image ? absoluteUrl(mediaUrl(v.image.storageKey, 1600)) : null;
  return {
    title: v.seoTitle ?? v.title,
    description,
    alternates: alternates(locale, v.href, v.alternate?.href ?? null),
    openGraph: { type: "video.other", title: v.title, description, url: v.href, ...(image ? { images: [{ url: image, alt: v.image!.alt }] } : {}) },
    twitter: image ? { card: "summary_large_image", title: v.title, description, images: [image] } : { card: "summary", title: v.title, description },
  };
}

export async function VideoPage({ locale, params }: VideoProps & { locale: Locale }) {
  const t = getDictionary(locale);
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const v = await getVideoPage(locale, slug);
  if (!v) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdSlot slot="top" label={t.advertisement} />
      <article className="mx-auto w-full max-w-3xl rounded-lg bg-white p-4 sm:p-8">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href={`/${locale}`} className="hover:underline">{t.home}</Link>
          <span aria-hidden="true"> › </span>
          <Link href={base(locale)} className="hover:underline">{t.videos}</Link>
          {v.category && (
            <>
              <span aria-hidden="true"> › </span>
              <Link href={v.category.href} className="hover:underline">{v.category.name}</Link>
            </>
          )}
        </nav>
        <h1 className="mt-3 text-[26px] font-bold leading-[1.45] sm:text-3xl sm:leading-[1.4]">{v.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {t.published}: <time dateTime={v.publishedAt}>{formatDateTime(v.publishedAt, locale)}</time>
        </p>
        <div className="mt-5">
          <YouTubePlayer
            youtubeId={v.youtubeId}
            title={v.title}
            image={v.image}
            durationSeconds={v.durationSeconds}
            labels={{ play: t.playVideo, privacy: t.videoLoadsFromYouTube, watchOnYouTube: t.watchOnYouTube, unavailable: t.videoUnavailable }}
          />
        </div>
        {/* Plain text: the description is never rendered as HTML. */}
        {v.description && <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-body">{v.description}</p>}
        {v.article && (
          <p className="mt-5 rounded bg-soft px-4 py-3">
            <span className="font-semibold">{t.relatedStory}: </span>
            <Link href={v.article.href} className="text-navy hover:underline">{v.article.headline}</Link>
          </p>
        )}
        <div className="mt-6">
          <ShareBar
            url={absoluteUrl(v.href)}
            title={v.title}
            summary={v.description.slice(0, 200)}
            labels={{ share: t.share, copyLink: t.copyLink, linkCopied: t.linkCopied, copyFailed: t.copyFailed, shareMore: t.shareMore, shareOn: t.shareOn }}
          />
        </div>
        {v.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <span className="text-sm font-semibold text-muted">{t.tags}:</span>
            <ul className="flex flex-wrap gap-2">
              {v.tags.map((tag) => (
                <li key={tag.href}>
                  <Link href={tag.href} className="block rounded bg-soft px-3 py-1.5 text-sm font-semibold hover:text-brand-dark">{tag.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
      {v.more.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading title={t.moreVideos} href={base(locale)} linkLabel={t.allVideos} />
          <VideoGrid videos={v.more} />
        </section>
      )}
    </div>
  );
}

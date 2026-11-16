import "server-only";
import { db } from "@/server/db/client";
import type { ArticleStatus, Prisma } from "@/generated/prisma/client";
import { isValidSlug, RESERVED_SLUGS } from "@/lib/content/slug";
import { parseYouTubeId, youtubeThumbnailUrls } from "@/lib/content/youtube";
import { uploadMedia } from "@/server/media/core";
import type { FieldErrors } from "./articles";

/**
 * Video administration. Callers must have checked the admin session.
 *
 * A video has one status for both editions. It appears in an edition when it
 * has a title and slug in that language. Only the YouTube ID is stored; the
 * player is loaded from youtube-nocookie.com when a reader presses play.
 */

export const VIDEO_LIMITS = { title: 200, description: 3000, seoTitle: 120, metaDescription: 300, maxSeconds: 24 * 3600 } as const;
export const ADMIN_VIDEO_PAGE_SIZE = 25;

type L = "si" | "en";
type Text = { title: string; description: string; slug: string; seoTitle: string; metaDescription: string };

export type VideoListRow = {
  id: string;
  youtubeId: string;
  title: { si: string | null; en: string | null };
  status: ArticleStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  isFeatured: boolean;
  durationSeconds: number;
  thumbnail: { storageKey: string } | null;
  deletedAt: Date | null;
};

export async function listVideos(filter: { q?: string; status?: ArticleStatus; deleted?: boolean; page?: number }) {
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim().slice(0, 100);
  const where: Prisma.VideoWhereInput = {
    deletedAt: filter.deleted ? { not: null } : null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(q ? { OR: [{ youtubeId: q }, { translations: { some: { title: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.video.count({ where }),
    db.video.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * ADMIN_VIDEO_PAGE_SIZE,
      take: ADMIN_VIDEO_PAGE_SIZE,
      include: { translations: { select: { locale: true, title: true } }, thumbnail: { select: { storageKey: true } } },
    }),
  ]);
  const items: VideoListRow[] = rows.map((v) => ({
    id: v.id,
    youtubeId: v.youtubeId,
    title: { si: v.translations.find((t) => t.locale === "si")?.title ?? null, en: v.translations.find((t) => t.locale === "en")?.title ?? null },
    status: v.status,
    scheduledAt: v.scheduledAt,
    publishedAt: v.publishedAt,
    isFeatured: v.isFeatured,
    durationSeconds: v.durationSeconds,
    thumbnail: v.thumbnail,
    deletedAt: v.deletedAt,
  }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_VIDEO_PAGE_SIZE)) };
}

export type EditableVideo = {
  id: string;
  youtubeId: string;
  durationSeconds: number;
  thumbnailMediaId: string | null;
  articleId: string | null;
  categoryId: string | null;
  tagIds: string[];
  isFeatured: boolean;
  status: ArticleStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
  translations: Record<L, Text | null>;
};

export async function getVideoForEdit(id: string): Promise<EditableVideo | null> {
  const v = await db.video.findUnique({ where: { id }, include: { translations: true, tags: { select: { tagId: true } } } });
  if (!v) return null;
  const tr = (l: L): Text | null => {
    const t = v.translations.find((x) => x.locale === l);
    return t ? { title: t.title, description: t.description ?? "", slug: t.slug ?? "", seoTitle: t.seoTitle ?? "", metaDescription: t.metaDescription ?? "" } : null;
  };
  return {
    id: v.id,
    youtubeId: v.youtubeId,
    durationSeconds: v.durationSeconds,
    thumbnailMediaId: v.thumbnailMediaId,
    articleId: v.articleId,
    categoryId: v.categoryId,
    tagIds: v.tags.map((t) => t.tagId),
    isFeatured: v.isFeatured,
    status: v.status,
    scheduledAt: v.scheduledAt,
    publishedAt: v.publishedAt,
    updatedAt: v.updatedAt,
    deletedAt: v.deletedAt,
    translations: { si: tr("si"), en: tr("en") },
  };
}

/** Recent published articles, for linking a video to its story. */
export async function articleChoices(): Promise<{ id: string; label: string }[]> {
  const rows = await db.articleTranslation.findMany({
    where: { article: { deletedAt: null }, status: { in: ["PUBLISHED", "SCHEDULED"] } },
    orderBy: { publishedAt: "desc" },
    take: 150,
    select: { articleId: true, locale: true, headline: true },
  });
  const seen = new Map<string, string>();
  for (const r of rows) if (!seen.has(r.articleId) || r.locale === "si") seen.set(r.articleId, r.headline);
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

export type VideoIntent = "save" | "publish" | "schedule" | "unpublish";

export type VideoInput = {
  id: string | null;
  expectedUpdatedAt: string | null;
  intent: VideoIntent;
  youtube: string;
  duration: number | null;
  scheduledAt: Date | null;
  thumbnailMediaId: string | null;
  articleId: string | null;
  categoryId: string | null;
  tagIds: string[];
  isFeatured: boolean;
  si: Text;
  en: Text;
};

export type VideoSaveResult =
  | { ok: true; id: string; status: ArticleStatus; updatedAt: string; youtubeId: string; hasThumbnail: boolean }
  | { ok: false; errors: FieldErrors; message: string };

export async function saveVideo(input: VideoInput, now: Date): Promise<VideoSaveResult> {
  const current = input.id ? await getVideoForEdit(input.id) : null;
  if (input.id && !current) return { ok: false, errors: {}, message: "This video no longer exists." };
  if (current?.deletedAt) return { ok: false, errors: {}, message: "This video is in the bin. Restore it before editing." };
  if (current && input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return { ok: false, errors: {}, message: "This video was changed somewhere else (another tab or window) after you opened it. Reload the page, then re-apply your changes." };
  }

  const errors: FieldErrors = {};
  const youtubeId = parseYouTubeId(input.youtube);
  if (!youtubeId) errors.youtube = "Paste a YouTube link (for example https://www.youtube.com/watch?v=… or https://youtu.be/…).";
  if (input.duration === null) errors.duration = "Write the length as minutes:seconds, for example 3:24.";
  else if (input.duration > VIDEO_LIMITS.maxSeconds) errors.duration = "That is longer than a day. Check the length.";

  const clean = (t: Text) => ({ title: t.title.trim(), description: t.description.trim(), slug: t.slug.trim(), seoTitle: t.seoTitle.trim(), metaDescription: t.metaDescription.trim() });
  const texts = { si: clean(input.si), en: clean(input.en) };
  const present = (["si", "en"] as const).filter((l) => Object.values(texts[l]).some(Boolean));
  if (present.length === 0) errors.form = "Give the video a title in at least one language.";
  for (const l of present) {
    const t = texts[l];
    if (!t.title) errors[`${l}.title`] = "Enter a title, or clear this language's fields to leave it out.";
    else if (t.title.length > VIDEO_LIMITS.title) errors[`${l}.title`] = `Keep the title under ${VIDEO_LIMITS.title} characters.`;
    if (t.description.length > VIDEO_LIMITS.description) errors[`${l}.description`] = `Keep the description under ${VIDEO_LIMITS.description} characters.`;
    if (t.seoTitle.length > VIDEO_LIMITS.seoTitle) errors[`${l}.seoTitle`] = `Keep it under ${VIDEO_LIMITS.seoTitle} characters.`;
    if (t.metaDescription.length > VIDEO_LIMITS.metaDescription) errors[`${l}.metaDescription`] = `Keep it under ${VIDEO_LIMITS.metaDescription} characters.`;
    if (!isValidSlug(t.slug)) errors[`${l}.slug`] = "Use lowercase English letters, numbers and single hyphens.";
    else if (RESERVED_SLUGS.has(t.slug)) errors[`${l}.slug`] = "This word is used by the site itself. Choose another slug.";
    else if (await db.videoTranslation.findFirst({ where: { locale: l, slug: t.slug, ...(current ? { videoId: { not: current.id } } : {}) }, select: { id: true } })) {
      errors[`${l}.slug`] = "Another video in this language already uses this slug.";
    }
  }

  const tagIds = [...new Set(input.tagIds)];
  const [tags, category, article, media] = await Promise.all([
    db.tag.count({ where: { id: { in: tagIds } } }),
    input.categoryId ? db.category.count({ where: { id: input.categoryId } }) : 1,
    input.articleId ? db.article.count({ where: { id: input.articleId, deletedAt: null } }) : 1,
    input.thumbnailMediaId ? db.media.count({ where: { id: input.thumbnailMediaId } }) : 1,
  ]);
  if (tags !== tagIds.length) errors.tags = "A selected tag no longer exists. Reload the page.";
  if (!category) errors.categoryId = "The selected category no longer exists.";
  if (!article) errors.articleId = "The linked article no longer exists.";
  if (!media) errors.thumbnailMediaId = "The selected image no longer exists.";

  let status: ArticleStatus = current?.status ?? "DRAFT";
  let publishedAt = current?.publishedAt ?? null;
  let scheduledAt = current?.scheduledAt ?? null;
  if (input.intent === "publish") {
    status = "PUBLISHED";
    publishedAt = current?.status === "SCHEDULED" || !publishedAt ? now : publishedAt;
    scheduledAt = null;
  } else if (input.intent === "schedule") {
    if (!input.scheduledAt) errors.scheduledAt = "Choose the date and time to publish.";
    else if (input.scheduledAt.getTime() <= now.getTime() + 60_000) errors.scheduledAt = "Choose a time at least two minutes from now, or publish now instead.";
    status = "SCHEDULED";
    scheduledAt = input.scheduledAt;
    publishedAt = input.scheduledAt;
  } else if (input.intent === "unpublish") {
    const wasPublic = current && (current.status === "PUBLISHED" || (current.status === "SCHEDULED" && !!current.scheduledAt && current.scheduledAt <= now));
    status = wasPublic ? "HIDDEN" : "DRAFT";
    scheduledAt = null;
    if (status === "DRAFT") publishedAt = null;
  }

  if (Object.keys(errors).length) return { ok: false, errors, message: errors.form ?? "Nothing was saved. Fix the highlighted fields." };

  const data = {
    youtubeId: youtubeId!,
    durationSeconds: input.duration ?? 0,
    thumbnailMediaId: input.thumbnailMediaId,
    articleId: input.articleId,
    categoryId: input.categoryId,
    isFeatured: input.isFeatured,
    isVisible: true,
    status,
    scheduledAt,
    publishedAt,
  };
  const saved = await db.$transaction(async (tx) => {
    const video = current ? await tx.video.update({ where: { id: current.id }, data }) : await tx.video.create({ data });
    await tx.videoTranslation.deleteMany({ where: { videoId: video.id, locale: { notIn: [...present] } } });
    for (const l of present) {
      const t = texts[l];
      const row = { title: t.title, description: t.description || null, slug: t.slug, seoTitle: t.seoTitle || null, metaDescription: t.metaDescription || null };
      await tx.videoTranslation.upsert({ where: { videoId_locale: { videoId: video.id, locale: l } }, create: { ...row, locale: l, videoId: video.id }, update: row });
    }
    await tx.videoTag.deleteMany({ where: { videoId: video.id } });
    if (tagIds.length) await tx.videoTag.createMany({ data: tagIds.map((tagId) => ({ videoId: video.id, tagId })) });
    return video;
  });
  return { ok: true, id: saved.id, status: saved.status, updatedAt: saved.updatedAt.toISOString(), youtubeId: saved.youtubeId, hasThumbnail: !!saved.thumbnailMediaId };
}

/**
 * Downloads YouTube's thumbnail once, re-encodes it like any upload, and sets
 * it as the video's image, so readers' browsers never contact YouTube until
 * they press play. Returns false when YouTube cannot be reached.
 */
export async function importYouTubeThumbnail(videoId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const v = await getVideoForEdit(videoId);
  if (!v || v.thumbnailMediaId) return !!v?.thumbnailMediaId;
  for (const url of youtubeThumbnailUrls(v.youtubeId)) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > 5 * 1024 * 1024) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) continue;
      const r = await uploadMedia(buf, {
        altSi: v.translations.si?.title ?? "",
        altEn: v.translations.en?.title ?? "",
        captionSi: "",
        captionEn: "",
        credit: "YouTube",
      });
      // A tiny grey placeholder (YouTube's answer for unknown videos) is refused as too small.
      if (!r.ok) continue;
      // Only fill an empty slot: the editor may have chosen an image meanwhile.
      await db.video.updateMany({ where: { id: videoId, thumbnailMediaId: null }, data: { thumbnailMediaId: r.id } });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export type VideoAction = "bin" | "restore" | "feature" | "unfeature";

export async function changeVideoState(id: string, action: VideoAction, now: Date): Promise<boolean> {
  const where = { id, ...(action === "restore" ? { deletedAt: { not: null } } : { deletedAt: null }) };
  const data: Prisma.VideoUpdateManyMutationInput =
    action === "bin" ? { deletedAt: now } : action === "restore" ? { deletedAt: null } : { isFeatured: action === "feature" };
  return (await db.video.updateMany({ where, data })).count === 1;
}

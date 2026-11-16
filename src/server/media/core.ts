import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db/client";
import { MEDIA_WIDTHS } from "@/lib/content/media";
import { processImage, UPLOAD_LIMITS, type ProcessError } from "./process";
import { deleteMediaFile, writeMediaFile } from "./storage";

/** Media library operations. Callers must have checked the admin session. */

export const MEDIA_TEXT_LIMITS = { alt: 250, caption: 300, credit: 120 } as const;

export const UPLOAD_ERROR_TEXT: Record<ProcessError | "no_alt", string> = {
  too_large: `The file is larger than ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB. Resize or compress it first.`,
  unsupported: "Only JPEG, PNG, WebP and AVIF images can be uploaded.",
  too_small: `The image is too small. Both sides must be at least ${UPLOAD_LIMITS.minSide} pixels.`,
  too_big_dimensions: `The image is too large. Neither side may be over ${UPLOAD_LIMITS.maxSide.toLocaleString("en-US")} pixels.`,
  corrupt: "The file could not be read as an image. It may be damaged.",
  no_alt: "Describe the image in at least one language (alt text). Screen readers and search engines use it.",
};

export type MediaText = { altSi: string; altEn: string; captionSi: string; captionEn: string; credit: string };

function translationsFrom(text: MediaText) {
  const rows: { locale: "si" | "en"; altText: string; caption: string | null }[] = [];
  if (text.altSi.trim()) rows.push({ locale: "si", altText: text.altSi.trim().slice(0, MEDIA_TEXT_LIMITS.alt), caption: text.captionSi.trim().slice(0, MEDIA_TEXT_LIMITS.caption) || null });
  if (text.altEn.trim()) rows.push({ locale: "en", altText: text.altEn.trim().slice(0, MEDIA_TEXT_LIMITS.alt), caption: text.captionEn.trim().slice(0, MEDIA_TEXT_LIMITS.caption) || null });
  return rows;
}

export async function uploadMedia(
  file: Buffer,
  text: MediaText,
): Promise<{ ok: true; id: string; duplicate: boolean } | { ok: false; error: keyof typeof UPLOAD_ERROR_TEXT }> {
  const translations = translationsFrom(text);
  if (translations.length === 0) return { ok: false, error: "no_alt" };

  const processed = await processImage(file);
  if (!processed.ok) return { ok: false, error: processed.error };
  const img = processed.image;

  // The same file uploaded twice reuses the first copy.
  const existing = await db.media.findFirst({ where: { checksum: img.checksum }, select: { id: true } });
  if (existing) return { ok: true, id: existing.id, duplicate: true };

  const storageKey = randomBytes(16).toString("hex");
  const written: string[] = [];
  try {
    for (const v of img.variants) {
      const name = `${storageKey}-${v.width}.webp`;
      await writeMediaFile(name, v.data);
      written.push(name);
    }
    const media = await db.media.create({
      data: {
        storageKey,
        mimeType: "image/webp",
        width: img.width,
        height: img.height,
        sizeBytes: img.variants[img.variants.length - 1].data.length,
        checksum: img.checksum,
        credit: text.credit.trim().slice(0, MEDIA_TEXT_LIMITS.credit) || null,
        translations: { create: translations },
      },
      select: { id: true },
    });
    return { ok: true, id: media.id, duplicate: false };
  } catch (error) {
    await Promise.all(written.map((n) => deleteMediaFile(n).catch(() => undefined)));
    throw error;
  }
}

export type MediaItem = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
  credit: string | null;
  createdAt: Date;
  altSi: string;
  altEn: string;
  captionSi: string;
  captionEn: string;
  uses: number;
};

export const MEDIA_PAGE_SIZE = 24;

export async function listMedia(opts: { q?: string; page?: number; take?: number }): Promise<{ items: MediaItem[]; total: number; pages: number; page: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const take = opts.take ?? MEDIA_PAGE_SIZE;
  const q = opts.q?.trim().slice(0, 100);
  const where = q
    ? {
        OR: [
          { translations: { some: { altText: { contains: q, mode: "insensitive" as const } } } },
          { translations: { some: { caption: { contains: q, mode: "insensitive" as const } } } },
          { credit: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    db.media.count({ where }),
    db.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: {
        translations: true,
        _count: { select: { articles: true, authors: true, videos: true, polls: true } },
      },
    }),
  ]);
  const items = rows.map((m) => {
    const si = m.translations.find((t) => t.locale === "si");
    const en = m.translations.find((t) => t.locale === "en");
    return {
      id: m.id,
      storageKey: m.storageKey,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
      credit: m.credit,
      createdAt: m.createdAt,
      altSi: si?.altText ?? "",
      altEn: en?.altText ?? "",
      captionSi: si?.caption ?? "",
      captionEn: en?.caption ?? "",
      uses: m._count.articles + m._count.authors + m._count.videos + m._count.polls,
    };
  });
  return { items, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getMediaItems(ids: string[]): Promise<MediaItem[]> {
  if (ids.length === 0) return [];
  const rows = await db.media.findMany({ where: { id: { in: ids } }, include: { translations: true, _count: { select: { articles: true, authors: true, videos: true, polls: true } } } });
  return rows.map((m) => ({
    id: m.id,
    storageKey: m.storageKey,
    width: m.width,
    height: m.height,
    sizeBytes: m.sizeBytes,
    credit: m.credit,
    createdAt: m.createdAt,
    altSi: m.translations.find((t) => t.locale === "si")?.altText ?? "",
    altEn: m.translations.find((t) => t.locale === "en")?.altText ?? "",
    captionSi: m.translations.find((t) => t.locale === "si")?.caption ?? "",
    captionEn: m.translations.find((t) => t.locale === "en")?.caption ?? "",
    uses: m._count.articles + m._count.authors + m._count.videos + m._count.polls,
  }));
}

export async function updateMediaText(id: string, text: MediaText): Promise<{ ok: true } | { ok: false; error: string }> {
  const translations = translationsFrom(text);
  if (translations.length === 0) return { ok: false, error: UPLOAD_ERROR_TEXT.no_alt };
  const found = await db.media.count({ where: { id } });
  if (!found) return { ok: false, error: "This image no longer exists." };
  await db.$transaction([
    db.media.update({ where: { id }, data: { credit: text.credit.trim().slice(0, MEDIA_TEXT_LIMITS.credit) || null } }),
    db.mediaTranslation.deleteMany({ where: { mediaId: id } }),
    db.mediaTranslation.createMany({ data: translations.map((t) => ({ ...t, mediaId: id })) }),
  ]);
  return { ok: true };
}

/** Deletes an image that nothing uses. Images in use must be replaced first. */
export async function deleteMedia(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await db.media.findUnique({
    where: { id },
    select: { storageKey: true, _count: { select: { articles: true, authors: true, videos: true, polls: true } } },
  });
  if (!m) return { ok: false, error: "This image no longer exists." };
  const uses = m._count.articles + m._count.authors + m._count.videos + m._count.polls;
  if (uses > 0) return { ok: false, error: `This image is used in ${uses} place(s). Replace it there first.` };
  await db.media.delete({ where: { id } });
  await Promise.all(MEDIA_WIDTHS.map((w) => deleteMediaFile(`${m.storageKey}-${w}.webp`).catch(() => undefined)));
  return { ok: true };
}

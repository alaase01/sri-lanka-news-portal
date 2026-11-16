import "server-only";
import { db } from "@/server/db/client";
import type { Locale } from "@/lib/i18n/config";

/**
 * Homepage curation: the hero stories and the breaking-news ticker (chosen
 * separately for each edition) and the category blocks (shared by both).
 * Callers must have checked the admin session.
 */

export const CURATION_LIMITS = { hero: 5, breaking: 8, blocks: 8, breakingText: 140 } as const;

type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });

/** Readers can see this language version now (or it is scheduled and due). */
function publicNow(locale: Locale, now: Date) {
  return {
    locale,
    article: { deletedAt: null },
    OR: [{ status: "PUBLISHED" as const, publishedAt: { lte: now } }, { status: "SCHEDULED" as const, scheduledAt: { lte: now } }],
  };
}

async function isPublic(articleId: string, locale: Locale, now: Date) {
  return (await db.articleTranslation.count({ where: { ...publicNow(locale, now), articleId } })) > 0;
}

// ───────────────────────── reading the current setup ─────────────────────────

export type CuratedStory = { id: string; articleId: string; headline: string; live: boolean; endsAt: Date | null };
export type CuratedBreaking = CuratedStory & { customText: string | null };
export type CuratedBlock = { id: string; categoryId: string; name: string; isEnabled: boolean };

export async function getCuration(locale: Locale, now: Date) {
  const [featured, breaking, blocks] = await Promise.all([
    db.featuredArticle.findMany({ where: { locale }, orderBy: { position: "asc" } }),
    db.breakingNews.findMany({ where: { locale, isActive: true }, orderBy: { createdAt: "desc" } }),
    db.homepageSection.findMany({
      where: { type: "CATEGORY_BLOCK" },
      orderBy: { sortOrder: "asc" },
      include: { category: { include: { translations: { select: { locale: true, name: true } } } } },
    }),
  ]);
  const ids = [...new Set([...featured, ...breaking].map((r) => r.articleId))];
  const [translations, publicIds] = await Promise.all([
    db.articleTranslation.findMany({ where: { articleId: { in: ids }, locale }, select: { articleId: true, headline: true } }),
    db.articleTranslation.findMany({ where: { ...publicNow(locale, now), articleId: { in: ids } }, select: { articleId: true } }),
  ]);
  const headline = new Map(translations.map((t) => [t.articleId, t.headline]));
  const live = new Set(publicIds.map((t) => t.articleId));

  return {
    hero: featured.map((f) => ({
      id: f.id,
      articleId: f.articleId,
      headline: headline.get(f.articleId) ?? "(no version in this language)",
      // Shown on the site only while the story is public and the pick has not ended.
      live: live.has(f.articleId) && (!f.endsAt || f.endsAt > now),
      endsAt: f.endsAt,
    })) satisfies CuratedStory[],
    breaking: breaking.map((b) => ({
      id: b.id,
      articleId: b.articleId,
      headline: headline.get(b.articleId) ?? "(no version in this language)",
      customText: b.customText,
      live: live.has(b.articleId) && (!b.expiresAt || b.expiresAt > now),
      endsAt: b.expiresAt,
    })) satisfies CuratedBreaking[],
    blocks: blocks.flatMap((s) => {
      if (!s.category || !s.categoryId) return [];
      const names = s.category.translations;
      const name = names.find((t) => t.locale === "en")?.name ?? names[0]?.name ?? "";
      const si = names.find((t) => t.locale === "si")?.name;
      return [{ id: s.id, categoryId: s.categoryId, name: si && si !== name ? `${name} / ${si}` : name, isEnabled: s.isEnabled }];
    }) satisfies CuratedBlock[],
  };
}

/** Recently published stories in one edition, newest first, for the pickers. */
export async function storyChoices(locale: Locale, now: Date, q?: string): Promise<{ id: string; label: string }[]> {
  const search = q?.trim().slice(0, 100);
  const rows = await db.articleTranslation.findMany({
    where: { ...publicNow(locale, now), ...(search ? { headline: { contains: search, mode: "insensitive" } } : {}) },
    orderBy: { publishedAt: "desc" },
    take: 60,
    select: { articleId: true, headline: true },
  });
  return rows.map((r) => ({ id: r.articleId, label: r.headline }));
}

// ───────────────────────── hero ─────────────────────────

async function renumberHero(locale: Locale) {
  const rows = await db.featuredArticle.findMany({ where: { locale }, orderBy: { position: "asc" }, select: { id: true } });
  await db.$transaction(rows.map((r, i) => db.featuredArticle.update({ where: { id: r.id }, data: { position: i } })));
}

export async function addHeroStory(locale: Locale, articleId: string, endsAt: Date | null, now: Date): Promise<Result> {
  if (!(await isPublic(articleId, locale, now))) return fail("Choose a story that is published in this language.");
  if (endsAt && endsAt <= now) return fail("The end time has already passed.");
  if ((await db.featuredArticle.count({ where: { locale } })) >= CURATION_LIMITS.hero) {
    return fail(`The hero holds at most ${CURATION_LIMITS.hero} stories. Remove one first.`);
  }
  if (await db.featuredArticle.findUnique({ where: { articleId_locale: { articleId, locale } } })) return fail("That story is already in the hero.");
  const last = await db.featuredArticle.findFirst({ where: { locale }, orderBy: { position: "desc" }, select: { position: true } });
  await db.featuredArticle.create({ data: { articleId, locale, endsAt, position: (last?.position ?? -1) + 1 } });
  return { ok: true };
}

export async function moveHeroStory(id: string, direction: -1 | 1): Promise<Result> {
  const row = await db.featuredArticle.findUnique({ where: { id } });
  if (!row) return fail("That story is no longer in the hero.");
  await renumberHero(row.locale);
  const rows = await db.featuredArticle.findMany({ where: { locale: row.locale }, orderBy: { position: "asc" } });
  const i = rows.findIndex((r) => r.id === id);
  const j = i + direction;
  if (j < 0 || j >= rows.length) return { ok: true };
  await db.$transaction([
    db.featuredArticle.update({ where: { id: rows[i].id }, data: { position: j } }),
    db.featuredArticle.update({ where: { id: rows[j].id }, data: { position: i } }),
  ]);
  return { ok: true };
}

export async function removeHeroStory(id: string): Promise<Result> {
  const row = await db.featuredArticle.findUnique({ where: { id } });
  if (!row) return { ok: true };
  await db.featuredArticle.delete({ where: { id } });
  await renumberHero(row.locale);
  return { ok: true };
}

// ───────────────────────── breaking news ─────────────────────────

export async function addBreaking(locale: Locale, articleId: string, customText: string, expiresAt: Date | null, now: Date): Promise<Result> {
  const text = customText.trim();
  if (!(await isPublic(articleId, locale, now))) return fail("Choose a story that is published in this language.");
  if (text.length > CURATION_LIMITS.breakingText) return fail(`Keep the ticker text under ${CURATION_LIMITS.breakingText} characters.`);
  if (expiresAt && expiresAt <= now) return fail("The end time has already passed.");
  if ((await db.breakingNews.count({ where: { locale, isActive: true } })) >= CURATION_LIMITS.breaking) {
    return fail(`The ticker holds at most ${CURATION_LIMITS.breaking} items. End one first.`);
  }
  if (await db.breakingNews.count({ where: { locale, articleId, isActive: true } })) return fail("That story is already in the ticker.");
  await db.breakingNews.create({ data: { locale, articleId, customText: text || null, expiresAt } });
  return { ok: true };
}

/** Takes an item off the ticker. The record is kept as history. */
export async function endBreaking(id: string): Promise<Result> {
  await db.breakingNews.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
  return { ok: true };
}

// ───────────────────────── category blocks ─────────────────────────

async function renumberBlocks() {
  const rows = await db.homepageSection.findMany({ where: { type: "CATEGORY_BLOCK" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  await db.$transaction(rows.map((r, i) => db.homepageSection.update({ where: { id: r.id }, data: { sortOrder: i } })));
}

export async function addBlock(categoryId: string): Promise<Result> {
  if (!(await db.category.count({ where: { id: categoryId } }))) return fail("Choose a category.");
  if ((await db.homepageSection.count({ where: { type: "CATEGORY_BLOCK" } })) >= CURATION_LIMITS.blocks) {
    return fail(`The homepage holds at most ${CURATION_LIMITS.blocks} category blocks.`);
  }
  if (await db.homepageSection.count({ where: { type: "CATEGORY_BLOCK", categoryId } })) return fail("That category already has a block.");
  const last = await db.homepageSection.findFirst({ where: { type: "CATEGORY_BLOCK" }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.homepageSection.create({ data: { type: "CATEGORY_BLOCK", categoryId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return { ok: true };
}

export async function moveBlock(id: string, direction: -1 | 1): Promise<Result> {
  await renumberBlocks();
  const rows = await db.homepageSection.findMany({ where: { type: "CATEGORY_BLOCK" }, orderBy: { sortOrder: "asc" } });
  const i = rows.findIndex((r) => r.id === id);
  const j = i + direction;
  if (i < 0) return fail("That block no longer exists.");
  if (j < 0 || j >= rows.length) return { ok: true };
  await db.$transaction([
    db.homepageSection.update({ where: { id: rows[i].id }, data: { sortOrder: j } }),
    db.homepageSection.update({ where: { id: rows[j].id }, data: { sortOrder: i } }),
  ]);
  return { ok: true };
}

export async function setBlockEnabled(id: string, isEnabled: boolean): Promise<Result> {
  await db.homepageSection.updateMany({ where: { id, type: "CATEGORY_BLOCK" }, data: { isEnabled } });
  return { ok: true };
}

export async function removeBlock(id: string): Promise<Result> {
  await db.homepageSection.deleteMany({ where: { id, type: "CATEGORY_BLOCK" } });
  await renumberBlocks();
  return { ok: true };
}

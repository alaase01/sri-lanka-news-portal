import "server-only";
import { db } from "@/server/db/client";
import type { ArticleStatus, Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n/config";
import { cleanBody, emptyBody, wordCount, type BodyDoc } from "@/lib/content/body";
import { isValidSlug, RESERVED_SLUGS } from "@/lib/content/slug";

/**
 * Article administration: listing, editing, publishing, revisions.
 * Callers (server actions, admin pages) must have checked the session first.
 *
 * Each language version is a separate ArticleTranslation with its own status;
 * category, tags, author and featured image are shared by both versions.
 */

export const ADMIN_PAGE_SIZE = 25;
export const LIMITS = { headline: 200, summary: 600, seoTitle: 120, metaDescription: 300, revisionsShown: 15 } as const;

// ───────────────────────── listing ─────────────────────────

export type ArticleListFilter = {
  q?: string;
  status?: ArticleStatus | "MISSING";
  locale?: Locale;
  categoryId?: string;
  deleted?: boolean;
  page?: number;
};

export type ArticleListRow = {
  id: string;
  categoryName: string;
  updatedAt: Date;
  deletedAt: Date | null;
  versions: Partial<Record<Locale, { headline: string; status: ArticleStatus; scheduledAt: Date | null; publishedAt: Date | null }>>;
};

export async function listArticles(filter: ArticleListFilter): Promise<{ rows: ArticleListRow[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim().slice(0, 100);
  const where: Prisma.ArticleWhereInput = { deletedAt: filter.deleted ? { not: null } : null };
  const and: Prisma.ArticleWhereInput[] = [];
  if (q) and.push({ translations: { some: { headline: { contains: q, mode: "insensitive" } } } });
  if (filter.categoryId) and.push({ OR: [{ primaryCategoryId: filter.categoryId }, { categories: { some: { categoryId: filter.categoryId } } }] });
  if (filter.status === "MISSING" && filter.locale) and.push({ translations: { none: { locale: filter.locale } } });
  else if (filter.status && filter.status !== "MISSING") and.push({ translations: { some: { status: filter.status, ...(filter.locale ? { locale: filter.locale } : {}) } } });
  else if (filter.locale) and.push({ translations: { some: { locale: filter.locale } } });
  if (and.length) where.AND = and;

  const [total, articles] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        updatedAt: true,
        deletedAt: true,
        primaryCategory: { select: { translations: { select: { locale: true, name: true } } } },
        translations: { select: { locale: true, headline: true, status: true, scheduledAt: true, publishedAt: true, updatedAt: true } },
      },
    }),
  ]);

  const rows = articles.map((a) => {
    const names = a.primaryCategory.translations;
    const versions: ArticleListRow["versions"] = {};
    let updatedAt = a.updatedAt;
    for (const t of a.translations) {
      versions[t.locale] = { headline: t.headline, status: t.status, scheduledAt: t.scheduledAt, publishedAt: t.publishedAt };
      if (t.updatedAt > updatedAt) updatedAt = t.updatedAt;
    }
    return {
      id: a.id,
      categoryName: names.find((n) => n.locale === "en")?.name ?? names[0]?.name ?? "—",
      updatedAt,
      deletedAt: a.deletedAt,
      versions,
    };
  });
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

// ───────────────────────── options for the editor ─────────────────────────

export type Option = { id: string; label: string };

/** Categories as "Parent › Child" labels, in tree order. */
export async function categoryOptions(): Promise<Option[]> {
  const all = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }],
    select: { id: true, parentId: true, translations: { select: { locale: true, name: true } } },
  });
  const label = (c: (typeof all)[number]) =>
    c.translations.find((t) => t.locale === "en")?.name ?? c.translations[0]?.name ?? c.id;
  const children = new Map<string | null, typeof all>();
  for (const c of all) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const out: Option[] = [];
  const walk = (parentId: string | null, prefix: string, depth: number) => {
    if (depth > 3) return;
    for (const c of children.get(parentId) ?? []) {
      const name = prefix ? `${prefix} › ${label(c)}` : label(c);
      out.push({ id: c.id, label: name });
      walk(c.id, name, depth + 1);
    }
  };
  walk(null, "", 1);
  return out;
}

export async function tagOptions(): Promise<Option[]> {
  const tags = await db.tag.findMany({ select: { id: true, translations: { select: { locale: true, name: true } } } });
  return tags
    .map((t) => {
      const si = t.translations.find((x) => x.locale === "si")?.name;
      const en = t.translations.find((x) => x.locale === "en")?.name;
      return { id: t.id, label: [en, si].filter(Boolean).join(" / ") || t.id };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function authorOptions(): Promise<Option[]> {
  const authors = await db.author.findMany({ select: { id: true, translations: { select: { locale: true, displayName: true } } } });
  return authors.map((a) => ({
    id: a.id,
    label: a.translations.find((t) => t.locale === "en")?.displayName ?? a.translations[0]?.displayName ?? a.id,
  }));
}

// ───────────────────────── loading one article ─────────────────────────

export type EditableTranslation = {
  id: string;
  headline: string;
  summary: string;
  body: BodyDoc;
  slug: string;
  seoTitle: string;
  metaDescription: string;
  status: ArticleStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  revisions: { id: string; createdAt: Date; status: ArticleStatus; note: string | null; headline: string }[];
};

export type EditableArticle = {
  id: string;
  primaryCategoryId: string;
  categoryIds: string[];
  tagIds: string[];
  authorId: string | null;
  featuredMediaId: string | null;
  deletedAt: Date | null;
  translations: Partial<Record<Locale, EditableTranslation>>;
};

export async function getArticleForEdit(id: string): Promise<EditableArticle | null> {
  const a = await db.article.findUnique({
    where: { id },
    include: {
      categories: { select: { categoryId: true } },
      tags: { select: { tagId: true } },
      translations: {
        include: {
          revisions: {
            orderBy: { createdAt: "desc" },
            take: LIMITS.revisionsShown,
            select: { id: true, createdAt: true, status: true, note: true, headline: true },
          },
        },
      },
    },
  });
  if (!a) return null;
  const translations: EditableArticle["translations"] = {};
  for (const t of a.translations) {
    translations[t.locale] = {
      id: t.id,
      headline: t.headline,
      summary: t.summary,
      body: cleanBody(t.body) ?? emptyBody(),
      slug: t.slug,
      seoTitle: t.seoTitle ?? "",
      metaDescription: t.metaDescription ?? "",
      status: t.status,
      scheduledAt: t.scheduledAt,
      publishedAt: t.publishedAt,
      updatedAt: t.updatedAt,
      revisions: t.revisions,
    };
  }
  return {
    id: a.id,
    primaryCategoryId: a.primaryCategoryId,
    categoryIds: a.categories.map((c) => c.categoryId).filter((c) => c !== a.primaryCategoryId),
    tagIds: a.tags.map((t) => t.tagId),
    authorId: a.authorId,
    featuredMediaId: a.featuredMediaId,
    deletedAt: a.deletedAt,
    translations,
  };
}

// ───────────────────────── validation ─────────────────────────

export type FieldErrors = Partial<Record<string, string>>;

export async function slugProblem(locale: Locale, slug: string, translationId: string | null): Promise<string | null> {
  if (!isValidSlug(slug)) return "Use lowercase English letters, numbers and single hyphens (for example: new-train-timetable).";
  if (RESERVED_SLUGS.has(slug)) return "This word is used by the site itself. Choose another slug.";
  const [taken, category] = await Promise.all([
    db.articleTranslation.findFirst({ where: { locale, slug, ...(translationId ? { id: { not: translationId } } : {}) }, select: { id: true } }),
    db.categoryTranslation.findFirst({ where: { locale, slug }, select: { id: true } }),
  ]);
  if (taken) return "Another article in this language already uses this slug.";
  if (category) return "A category uses this slug. Choose another one.";
  return null;
}

async function missingIds(input: { categoryIds: string[]; tagIds: string[]; authorId: string | null; featuredMediaId: string | null }) {
  const [categories, tags, author, media] = await Promise.all([
    db.category.count({ where: { id: { in: input.categoryIds } } }),
    db.tag.count({ where: { id: { in: input.tagIds } } }),
    input.authorId ? db.author.count({ where: { id: input.authorId } }) : 1,
    input.featuredMediaId ? db.media.count({ where: { id: input.featuredMediaId } }) : 1,
  ]);
  const errors: FieldErrors = {};
  if (categories !== new Set(input.categoryIds).size) errors.categories = "A selected category no longer exists. Reload the page.";
  if (tags !== new Set(input.tagIds).size) errors.tags = "A selected tag no longer exists. Reload the page.";
  if (!author) errors.authorId = "The selected author no longer exists.";
  if (!media) errors.featuredMediaId = "The selected image no longer exists.";
  return errors;
}

// ───────────────────────── create ─────────────────────────

export type CreateInput = { locale: Locale; headline: string; slug: string; primaryCategoryId: string };

export async function createArticle(input: CreateInput, now: Date): Promise<{ ok: true; id: string } | { ok: false; errors: FieldErrors }> {
  const errors: FieldErrors = {};
  const headline = input.headline.trim();
  if (!headline) errors.headline = "Enter a headline.";
  else if (headline.length > LIMITS.headline) errors.headline = `Keep the headline under ${LIMITS.headline} characters.`;
  const slugError = await slugProblem(input.locale, input.slug, null);
  if (slugError) errors.slug = slugError;
  if (!(await db.category.count({ where: { id: input.primaryCategoryId } }))) errors.primaryCategoryId = "Choose a category.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const body = emptyBody() as unknown as Prisma.InputJsonValue;
  const article = await db.article.create({
    data: {
      primaryCategoryId: input.primaryCategoryId,
      createdAt: now,
      translations: {
        create: {
          locale: input.locale,
          headline,
          slug: input.slug,
          body,
          status: "DRAFT",
          revisions: { create: { headline, summary: "", body, status: "DRAFT", note: "Created" } },
        },
      },
    },
    select: { id: true },
  });
  return { ok: true, id: article.id };
}

// ───────────────────────── save / publish ─────────────────────────

export type SaveIntent = "save" | "publish" | "schedule" | "unpublish";

export type SaveInput = {
  articleId: string;
  locale: Locale;
  /** updatedAt of the translation when the editor was opened; null when creating this language version. */
  expectedUpdatedAt: string | null;
  intent: SaveIntent;
  scheduledAt: Date | null;
  shared: { primaryCategoryId: string; categoryIds: string[]; tagIds: string[]; authorId: string | null; featuredMediaId: string | null };
  translation: { headline: string; summary: string; body: unknown; slug: string; seoTitle: string; metaDescription: string };
  /** Overrides the automatic note on the revision this save creates. */
  revisionNote?: string;
};

export type SaveResult =
  | { ok: true; status: ArticleStatus; updatedAt: string; translationId: string; slugChanged: boolean }
  | { ok: false; errors: FieldErrors; message: string };

export async function saveArticle(input: SaveInput, now: Date): Promise<SaveResult> {
  const article = await db.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, deletedAt: true, translations: { where: { locale: input.locale } } },
  });
  if (!article) return { ok: false, errors: {}, message: "This article no longer exists." };
  if (article.deletedAt) return { ok: false, errors: {}, message: "This article is in the bin. Restore it before editing." };
  const current = article.translations[0] ?? null;

  if (current && input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return {
      ok: false,
      errors: {},
      message: "This version was changed somewhere else (another tab or window) after you opened it. Copy your text, reload the page, then re-apply your changes.",
    };
  }
  if (!current && input.expectedUpdatedAt) {
    return { ok: false, errors: {}, message: "This language version was removed after you opened it. Reload the page." };
  }

  const t = input.translation;
  const headline = t.headline.trim();
  const summary = t.summary.trim();
  const seoTitle = t.seoTitle.trim();
  const metaDescription = t.metaDescription.trim();
  const body = cleanBody(t.body);
  const errors: FieldErrors = {};

  if (!headline) errors.headline = "Enter a headline.";
  else if (headline.length > LIMITS.headline) errors.headline = `Keep the headline under ${LIMITS.headline} characters.`;
  if (summary.length > LIMITS.summary) errors.summary = `Keep the summary under ${LIMITS.summary} characters.`;
  if (seoTitle.length > LIMITS.seoTitle) errors.seoTitle = `Keep the search title under ${LIMITS.seoTitle} characters.`;
  if (metaDescription.length > LIMITS.metaDescription) errors.metaDescription = `Keep the description under ${LIMITS.metaDescription} characters.`;
  if (!body) errors.body = "The article text could not be read. Reload the page and try again.";
  const slugError = await slugProblem(input.locale, t.slug, current?.id ?? null);
  if (slugError) errors.slug = slugError;

  const categoryIds = [...new Set(input.shared.categoryIds.filter((c) => c !== input.shared.primaryCategoryId))];
  const tagIds = [...new Set(input.shared.tagIds)];
  Object.assign(
    errors,
    await missingIds({
      categoryIds: [input.shared.primaryCategoryId, ...categoryIds],
      tagIds,
      authorId: input.shared.authorId,
      featuredMediaId: input.shared.featuredMediaId,
    }),
  );
  if (errors.categories && !(await db.category.count({ where: { id: input.shared.primaryCategoryId } }))) {
    errors.primaryCategoryId = "Choose a category.";
  }

  // What the status becomes.
  let status: ArticleStatus = current?.status ?? "DRAFT";
  let publishedAt = current?.publishedAt ?? null;
  let scheduledAt = current?.scheduledAt ?? null;
  if (input.intent === "publish") {
    status = "PUBLISHED";
    // A scheduled article published early, or one never published, gets "now".
    publishedAt = current?.status === "SCHEDULED" || !publishedAt ? now : publishedAt;
    scheduledAt = null;
  } else if (input.intent === "schedule") {
    if (!input.scheduledAt) errors.scheduledAt = "Choose the date and time to publish.";
    else if (input.scheduledAt.getTime() <= now.getTime() + 60_000) errors.scheduledAt = "Choose a time at least two minutes from now, or publish now instead.";
    status = "SCHEDULED";
    scheduledAt = input.scheduledAt;
    // Listings sort by publishedAt, so it carries the scheduled time.
    publishedAt = input.scheduledAt;
  } else if (input.intent === "unpublish") {
    status = current && wasPublic(current, now) ? "HIDDEN" : "DRAFT";
    scheduledAt = null;
    if (status === "DRAFT") publishedAt = null;
  }
  if ((input.intent === "publish" || input.intent === "schedule") && body && wordCount(body) === 0) {
    errors.body = "Write the article text before publishing.";
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors, message: "Nothing was saved. Fix the highlighted fields." };
  }

  const bodyJson = body as unknown as Prisma.InputJsonValue;
  // A significant edit: the public text of a version that readers have already seen changed.
  const stillPublic = status === "PUBLISHED" || status === "SCHEDULED";
  const textChanged =
    !!current && (current.headline !== headline || current.summary !== summary || JSON.stringify(cleanBody(current.body)) !== JSON.stringify(body));
  const modifiedAt = current && stillPublic && wasPublic(current, now) && textChanged ? now : (current?.modifiedAt ?? null);
  const slugChanged = !!current && current.slug !== t.slug;
  const note =
    input.revisionNote ??
    (input.intent === "publish" ? "Published" : input.intent === "schedule" ? "Scheduled" : input.intent === "unpublish" ? "Unpublished" : current ? null : "Created");

  const saved = await db.$transaction(async (tx) => {
    await tx.article.update({
      where: { id: input.articleId },
      data: {
        primaryCategoryId: input.shared.primaryCategoryId,
        authorId: input.shared.authorId,
        featuredMediaId: input.shared.featuredMediaId,
        categories: { deleteMany: {}, create: categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
      },
    });

    const data = {
      headline,
      summary,
      body: bodyJson,
      slug: t.slug,
      seoTitle: seoTitle || null,
      metaDescription: metaDescription || null,
      status,
      publishedAt,
      scheduledAt,
      modifiedAt: status === "DRAFT" ? null : modifiedAt,
    };
    const translation = current
      ? await tx.articleTranslation.update({ where: { id: current.id }, data })
      : await tx.articleTranslation.create({ data: { ...data, articleId: input.articleId, locale: input.locale } });

    // A slug this version now uses can no longer redirect elsewhere.
    if (!current || slugChanged) await tx.slugRedirect.deleteMany({ where: { locale: input.locale, oldPath: t.slug } });
    // Old links keep working: a slug that readers may have seen redirects to the new one.
    if (slugChanged && current && current.publishedAt) {
      await tx.slugRedirect.upsert({
        where: { locale_oldPath: { locale: input.locale, oldPath: current.slug } },
        create: { locale: input.locale, oldPath: current.slug, translationId: translation.id },
        update: { translationId: translation.id },
      });
    }

    await tx.articleRevision.create({
      data: { translationId: translation.id, headline, summary, body: bodyJson, status, note },
    });
    return translation;
  });

  return { ok: true, status: saved.status, updatedAt: saved.updatedAt.toISOString(), translationId: saved.id, slugChanged };
}

/** True when readers could have seen this version at some point. */
function wasPublic(t: { status: ArticleStatus; publishedAt: Date | null; scheduledAt: Date | null }, now: Date): boolean {
  if (t.status === "SCHEDULED") return !!t.scheduledAt && t.scheduledAt <= now;
  return t.publishedAt !== null && t.publishedAt <= now;
}

// ───────────────────────── revisions, bin ─────────────────────────

/** Copies an earlier revision's headline, summary and text into the current version. Status is unchanged. */
export async function restoreRevision(revisionId: string): Promise<{ ok: true; articleId: string; locale: Locale } | { ok: false; message: string }> {
  const rev = await db.articleRevision.findUnique({
    where: { id: revisionId },
    include: { translation: { select: { id: true, articleId: true, locale: true, status: true } } },
  });
  if (!rev) return { ok: false, message: "That revision no longer exists." };
  const body = (cleanBody(rev.body) ?? emptyBody()) as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.articleTranslation.update({ where: { id: rev.translationId }, data: { headline: rev.headline, summary: rev.summary, body } }),
    db.articleRevision.create({
      data: {
        translationId: rev.translationId,
        headline: rev.headline,
        summary: rev.summary,
        body,
        status: rev.translation.status,
        note: `Restored the version saved ${rev.createdAt.toISOString()}`,
      },
    }),
  ]);
  return { ok: true, articleId: rev.translation.articleId, locale: rev.translation.locale };
}

/** Moves an article to the bin: it disappears from the site at once; nothing is erased. */
export async function binArticle(id: string, now: Date): Promise<boolean> {
  const r = await db.article.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } });
  return r.count === 1;
}

export async function restoreArticle(id: string): Promise<boolean> {
  const r = await db.article.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
  return r.count === 1;
}

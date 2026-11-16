import "server-only";
import { db } from "@/server/db/client";
import type { Locale } from "@/lib/i18n/config";
import { isValidSlug, RESERVED_SLUGS } from "@/lib/content/slug";
import type { FieldErrors } from "./articles";

/**
 * Categories and tags. Callers must have checked the admin session.
 *
 * Categories form a tree at most three levels deep and appear in the URL
 * (/si/politics/parliament), so both language versions are required. Tags may
 * exist in one language only.
 */

export const MAX_CATEGORY_DEPTH = 3;
export const TAXONOMY_LIMITS = { name: 80, description: 300, sortOrder: 9999 } as const;

type LocaleText = { name: string; slug: string; description?: string };

const SLUG_HELP = "Use lowercase English letters, numbers and single hyphens.";

async function slugCollision(kind: "category" | "tag", locale: Locale, slug: string, ownId: string | null): Promise<string | null> {
  if (!isValidSlug(slug)) return SLUG_HELP;
  if (RESERVED_SLUGS.has(slug)) return "This word is used by the site itself. Choose another slug.";
  if (kind === "category") {
    const [category, article] = await Promise.all([
      db.categoryTranslation.findFirst({ where: { locale, slug, ...(ownId ? { categoryId: { not: ownId } } : {}) }, select: { id: true } }),
      db.articleTranslation.findFirst({ where: { locale, slug }, select: { id: true } }),
    ]);
    if (category) return "Another category already uses this slug.";
    if (article) return "An article uses this slug. Choose another one.";
  } else {
    const tag = await db.tagTranslation.findFirst({ where: { locale, slug, ...(ownId ? { tagId: { not: ownId } } : {}) }, select: { id: true } });
    if (tag) return "Another tag already uses this slug.";
  }
  return null;
}

// ───────────────────────── categories ─────────────────────────

export type CategoryRow = {
  id: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  isVisible: boolean;
  si: { name: string; slug: string; description: string };
  en: { name: string; slug: string; description: string };
  articleCount: number;
  childCount: number;
};

/** All categories in tree order (parents before their children). */
export async function listCategoryTree(): Promise<CategoryRow[]> {
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      translations: true,
      _count: { select: { primaryArticles: true, articles: true, children: true } },
    },
  });
  const children = new Map<string | null, typeof rows>();
  for (const r of rows) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
  const out: CategoryRow[] = [];
  const text = (r: (typeof rows)[number], l: Locale) => {
    const t = r.translations.find((x) => x.locale === l);
    return { name: t?.name ?? "", slug: t?.slug ?? "", description: t?.description ?? "" };
  };
  const walk = (parentId: string | null, depth: number) => {
    for (const r of children.get(parentId) ?? []) {
      out.push({
        id: r.id,
        parentId: r.parentId,
        depth,
        sortOrder: r.sortOrder,
        isVisible: r.isVisible,
        si: text(r, "si"),
        en: text(r, "en"),
        articleCount: r._count.primaryArticles + r._count.articles,
        childCount: r._count.children,
      });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

export type CategoryInput = {
  id: string | null;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
  si: LocaleText;
  en: LocaleText;
};

export async function saveCategory(input: CategoryInput): Promise<{ ok: true; id: string } | { ok: false; errors: FieldErrors }> {
  const errors: FieldErrors = {};
  const tree = await listCategoryTree();
  const byId = new Map(tree.map((c) => [c.id, c]));
  const self = input.id ? byId.get(input.id) : null;
  if (input.id && !self) return { ok: false, errors: { form: "This category no longer exists." } };

  for (const l of ["si", "en"] as const) {
    const name = input[l].name.trim();
    if (!name) errors[`${l}.name`] = "Enter a name.";
    else if (name.length > TAXONOMY_LIMITS.name) errors[`${l}.name`] = `Keep the name under ${TAXONOMY_LIMITS.name} characters.`;
    if ((input[l].description ?? "").length > TAXONOMY_LIMITS.description) errors[`${l}.description`] = `Keep it under ${TAXONOMY_LIMITS.description} characters.`;
    const slugError = await slugCollision("category", l, input[l].slug, input.id);
    if (slugError) errors[`${l}.slug`] = slugError;
  }

  if (input.parentId) {
    const parent = byId.get(input.parentId);
    if (!parent) errors.parentId = "The chosen parent no longer exists.";
    else {
      // A category cannot sit inside itself or one of its own subcategories.
      let cursor: CategoryRow | undefined = parent;
      while (cursor) {
        if (cursor.id === input.id) {
          errors.parentId = "A category cannot be placed inside itself or one of its subcategories.";
          break;
        }
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      if (!errors.parentId) {
        const subtreeHeight = input.id ? heightOf(input.id, tree) : 1;
        if (parent.depth + subtreeHeight > MAX_CATEGORY_DEPTH) {
          errors.parentId = `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep. Choose a higher-level parent.`;
        }
      }
    }
  }
  if (!Number.isInteger(input.sortOrder) || Math.abs(input.sortOrder) > TAXONOMY_LIMITS.sortOrder) errors.sortOrder = "Enter a whole number.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const translations = (["si", "en"] as const).map((locale) => ({
    locale,
    name: input[locale].name.trim(),
    slug: input[locale].slug,
    description: input[locale].description?.trim() || null,
  }));

  const id = await db.$transaction(async (tx) => {
    if (input.id) {
      await tx.category.update({ where: { id: input.id }, data: { parentId: input.parentId, sortOrder: input.sortOrder, isVisible: input.isVisible } });
      for (const t of translations) {
        await tx.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: input.id, locale: t.locale } },
          create: { ...t, categoryId: input.id },
          update: { name: t.name, slug: t.slug, description: t.description },
        });
      }
      return input.id;
    }
    const created = await tx.category.create({
      data: { parentId: input.parentId, sortOrder: input.sortOrder, isVisible: input.isVisible, translations: { create: translations } },
      select: { id: true },
    });
    return created.id;
  });
  return { ok: true, id };
}

/** Number of levels in the subtree rooted at `id` (1 for a category without children). */
function heightOf(id: string, tree: CategoryRow[]): number {
  const kids = tree.filter((c) => c.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(k.id, tree))) : 0);
}

/** Deletes a category that nothing uses. */
export async function deleteCategory(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await db.category.findUnique({
    where: { id },
    select: { _count: { select: { children: true, primaryArticles: true, articles: true, videos: true, navigationItems: true, homepageSections: true } } },
  });
  if (!c) return { ok: false, error: "This category no longer exists." };
  const n = c._count;
  if (n.children) return { ok: false, error: "This category has subcategories. Move or delete them first." };
  if (n.primaryArticles || n.articles) return { ok: false, error: `${n.primaryArticles + n.articles} article(s) use this category, including any in the bin. Move them to another category first.` };
  if (n.videos) return { ok: false, error: "Videos use this category. Move them first." };
  if (n.navigationItems || n.homepageSections) return { ok: false, error: "The site menu or homepage uses this category. Remove it there first." };
  await db.category.delete({ where: { id } });
  return { ok: true };
}

// ───────────────────────── tags ─────────────────────────

export type TagRow = { id: string; si: { name: string; slug: string } | null; en: { name: string; slug: string } | null; articleCount: number };

export const TAG_PAGE_SIZE = 50;

export async function listTags(opts: { q?: string; page?: number }): Promise<{ rows: TagRow[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().slice(0, 80);
  const where = q
    ? { translations: { some: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q.toLowerCase() } }] } } }
    : {};
  const [total, tags] = await Promise.all([
    db.tag.count({ where }),
    db.tag.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * TAG_PAGE_SIZE,
      take: TAG_PAGE_SIZE,
      include: { translations: true, _count: { select: { articles: true } } },
    }),
  ]);
  const rows = tags.map((t) => {
    const pick = (l: Locale) => {
      const x = t.translations.find((y) => y.locale === l);
      return x ? { name: x.name, slug: x.slug } : null;
    };
    return { id: t.id, si: pick("si"), en: pick("en"), articleCount: t._count.articles };
  });
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / TAG_PAGE_SIZE)) };
}

export async function getTag(id: string): Promise<TagRow | null> {
  const t = await db.tag.findUnique({ where: { id }, include: { translations: true, _count: { select: { articles: true } } } });
  if (!t) return null;
  const pick = (l: Locale) => {
    const x = t.translations.find((y) => y.locale === l);
    return x ? { name: x.name, slug: x.slug } : null;
  };
  return { id: t.id, si: pick("si"), en: pick("en"), articleCount: t._count.articles };
}

export type TagInput = { id: string | null; si: { name: string; slug: string }; en: { name: string; slug: string } };

export async function saveTag(input: TagInput): Promise<{ ok: true; id: string } | { ok: false; errors: FieldErrors }> {
  const errors: FieldErrors = {};
  const present = (["si", "en"] as const).filter((l) => input[l].name.trim() || input[l].slug.trim());
  if (present.length === 0) errors.form = "Give the tag a name in at least one language.";
  for (const l of present) {
    const name = input[l].name.trim();
    if (!name) errors[`${l}.name`] = "Enter a name, or clear the slug to leave this language out.";
    else if (name.length > TAXONOMY_LIMITS.name) errors[`${l}.name`] = `Keep the name under ${TAXONOMY_LIMITS.name} characters.`;
    const slugError = await slugCollision("tag", l, input[l].slug.trim(), input.id);
    if (slugError) errors[`${l}.slug`] = slugError;
  }
  if (input.id && !(await db.tag.count({ where: { id: input.id } }))) errors.form = "This tag no longer exists.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const rows = present.map((locale) => ({ locale, name: input[locale].name.trim(), slug: input[locale].slug.trim() }));
  const id = await db.$transaction(async (tx) => {
    const tagId = input.id ?? (await tx.tag.create({ data: {}, select: { id: true } })).id;
    await tx.tagTranslation.deleteMany({ where: { tagId, locale: { notIn: present } } });
    for (const r of rows) {
      await tx.tagTranslation.upsert({
        where: { tagId_locale: { tagId, locale: r.locale } },
        create: { ...r, tagId },
        update: { name: r.name, slug: r.slug },
      });
    }
    return tagId;
  });
  return { ok: true, id };
}

/** Deletes a tag and removes it from every article. */
export async function deleteTag(id: string): Promise<boolean> {
  const r = await db.tag.deleteMany({ where: { id } });
  return r.count === 1;
}

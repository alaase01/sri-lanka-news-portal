import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import type { Locale } from "@/lib/i18n/config";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Read-side content queries for the public site.
 *
 * Every exported function is cached and tagged, so pages are served from cache and
 * refreshed on a short timer (and, once the admin portal exists, by tag on publish).
 * Return values are plain serialisable objects with ISO date strings.
 */

export const PAGE_SIZE = 12;

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  /** Slugs from the root section down to this category. */
  path: string[];
  href: string;
  description: string | null;
  icon: string | null;
};

/** A processed upload, ready for <img srcset>. */
export type CardImage = { storageKey: string; width: number; height: number; alt: string };

export type ArticleCard = {
  id: string;
  image: CardImage | null;
  headline: string;
  summary: string;
  href: string;
  publishedAt: string;
  categoryName: string | null;
  categoryHref: string | null;
};

export type Crumb = { name: string; href: string };

// ───────────────────────── helpers (not cached, pure) ─────────────────────────

/** A translation is public when published, or scheduled with its time already passed. */
function publishedWhere(locale: Locale, now: Date): Prisma.ArticleTranslationWhereInput {
  return {
    locale,
    article: { deletedAt: null },
    OR: [{ status: "PUBLISHED" }, { status: "SCHEDULED", scheduledAt: { lte: now } }],
  };
}

const cardSelect = {
  id: true,
  headline: true,
  summary: true,
  slug: true,
  publishedAt: true,
  scheduledAt: true,
  createdAt: true,
  locale: true,
  article: {
    select: {
      id: true,
      primaryCategoryId: true,
      featuredMedia: { select: { storageKey: true, width: true, height: true, translations: { select: { locale: true, altText: true, caption: true } } } },
    },
  },
} satisfies Prisma.ArticleTranslationSelect;

type MediaRow = {
  storageKey: string;
  width: number;
  height: number;
  translations: { locale: Locale; altText: string; caption: string | null }[];
};

/** Alt text in the reader's language, falling back to the other language. */
function cardImage(media: MediaRow | null, locale: Locale): CardImage | null {
  if (!media) return null;
  const own = media.translations.find((t) => t.locale === locale);
  const alt = own?.altText ?? media.translations[0]?.altText ?? "";
  return { storageKey: media.storageKey, width: media.width, height: media.height, alt };
}

type CardRow = Prisma.ArticleTranslationGetPayload<{ select: typeof cardSelect }>;

function articleHref(locale: Locale, category: CategoryNode | undefined, slug: string): string {
  return `/${locale}/${[...(category?.path ?? []), slug].join("/")}`;
}

function toCard(row: CardRow, locale: Locale, byId: Map<string, CategoryNode>): ArticleCard {
  const category = byId.get(row.article.primaryCategoryId);
  return {
    id: row.article.id,
    image: cardImage(row.article.featuredMedia, locale),
    headline: row.headline,
    summary: row.summary,
    href: articleHref(locale, category, row.slug),
    publishedAt: (row.publishedAt ?? row.scheduledAt ?? row.createdAt).toISOString(),
    categoryName: category?.name ?? null,
    categoryHref: category?.href ?? null,
  };
}

function indexById(categories: CategoryNode[]): Map<string, CategoryNode> {
  return new Map(categories.map((c) => [c.id, c]));
}

/** The category itself plus every descendant. */
function withDescendants(categories: CategoryNode[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const c of categories) if (c.parentId === ids[i]) ids.push(c.id);
  }
  return ids;
}

function inCategories(ids: string[]): Prisma.ArticleWhereInput {
  return {
    deletedAt: null,
    OR: [{ primaryCategoryId: { in: ids } }, { categories: { some: { categoryId: { in: ids } } } }],
  };
}

function crumbsFor(category: CategoryNode, byId: Map<string, CategoryNode>): Crumb[] {
  const crumbs: Crumb[] = [];
  let current: CategoryNode | undefined = category;
  while (current) {
    crumbs.unshift({ name: current.name, href: current.href });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return crumbs;
}

// ───────────────────────── categories and navigation ─────────────────────────

/**
 * All categories visible in this edition, with their URL paths.
 * A category is left out if it, or any ancestor, is hidden or has no name in this language.
 */
export async function getCategoryIndex(locale: Locale): Promise<CategoryNode[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");

  const rows = await db.category.findMany({
    where: { isVisible: true, translations: { some: { locale } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: { where: { locale } } },
  });
  const raw = new Map(rows.map((r) => [r.id, r]));
  const nodes: CategoryNode[] = [];

  for (const row of rows) {
    const path: string[] = [];
    let current: (typeof rows)[number] | undefined = row;
    let depth = 0;
    let reachable = true;
    while (current) {
      path.unshift(current.translations[0].slug);
      if (!current.parentId) break;
      current = raw.get(current.parentId);
      // Missing parent (hidden or untranslated) or a runaway chain: drop this category.
      if (!current || ++depth > 8) reachable = false;
      if (!reachable) break;
    }
    if (!reachable) continue;
    const t = row.translations[0];
    nodes.push({
      id: row.id,
      parentId: row.parentId,
      name: t.name,
      slug: t.slug,
      path,
      href: `/${locale}/${path.join("/")}`,
      description: t.description,
      icon: row.icon,
    });
  }
  return nodes;
}

export type NavLink = { id: string; label: string; href: string; children: NavLink[] };

export type SiteChrome = {
  siteName: string;
  tagline: string | null;
  notice: string | null;
  social: { name: string; url: string }[];
  nav: NavLink[];
};

/** Header and footer data: navigation, tagline, demo notice and social links. */
export async function getSiteChrome(locale: Locale): Promise<SiteChrome> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories", "navigation", "settings");

  const [categories, items, settings] = await Promise.all([
    getCategoryIndex(locale),
    db.navigationItem.findMany({
      where: { isVisible: true, translations: { some: { locale } } },
      orderBy: { sortOrder: "asc" },
      include: { translations: { where: { locale } } },
    }),
    db.siteSettings.findUnique({ where: { id: 1 } }),
  ]);
  const byId = indexById(categories);

  const toLink = (item: (typeof items)[number]): NavLink | null => {
    const href =
      item.targetType === "CATEGORY"
        ? item.categoryId
          ? byId.get(item.categoryId)?.href
          : undefined
        : (item.url ?? undefined);
    if (!href) return null;
    return { id: item.id, label: item.translations[0].label, href, children: [] };
  };

  const nav: NavLink[] = [];
  for (const item of items.filter((i) => !i.parentId)) {
    const link = toLink(item);
    if (!link) continue;
    link.children = items
      .filter((i) => i.parentId === item.id)
      .map(toLink)
      .filter((l): l is NavLink => l !== null);
    nav.push(link);
  }

  const localized = (settings?.localized ?? {}) as Record<string, { tagline?: string; notice?: string }>;
  const social = (settings?.socialLinks ?? {}) as Record<string, string>;

  return {
    siteName: settings?.siteName ?? "RSnewslk.com",
    tagline: localized[locale]?.tagline ?? null,
    notice: localized[locale]?.notice ?? null,
    social: Object.entries(social)
      .filter(([, url]) => typeof url === "string" && /^https:\/\//.test(url))
      .map(([name, url]) => ({ name, url })),
    nav,
  };
}

/** Root category paths, used to prerender section pages at build time. */
export async function getRootCategoryPaths(locale: Locale): Promise<string[][]> {
  const categories = await getCategoryIndex(locale);
  return categories.filter((c) => !c.parentId).map((c) => c.path);
}

// ───────────────────────── homepage ─────────────────────────

export type HeroSlide = ArticleCard;
export type BreakingItem = { id: string; text: string; href: string };
export type VideoCard = { id: string; title: string; durationSeconds: number; href: string | null };
export type CategoryBlock = { category: CategoryNode; articles: ArticleCard[] };

export type HomepageData = {
  hero: HeroSlide[];
  breaking: BreakingItem[];
  latest: ArticleCard[];
  mostRead: ArticleCard[];
  videos: VideoCard[];
  topStories: ArticleCard[];
  categoryBlocks: CategoryBlock[];
  quickCategories: CategoryNode[];
};

export async function getHomepage(locale: Locale): Promise<HomepageData> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "homepage", "categories");

  const now = new Date();
  const published = publishedWhere(locale, now);
  const categories = await getCategoryIndex(locale);
  const byId = indexById(categories);
  const settings = await db.siteSettings.findUnique({ where: { id: 1 } });
  const since = new Date(now.getTime() - (settings?.mostReadWindowDays ?? 7) * 86_400_000);

  const [featuredRows, breakingRows, latestRows, viewRows, videoRows, sections] = await Promise.all([
    db.featuredArticle.findMany({
      where: { locale, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { position: "asc" },
      take: 5,
    }),
    db.breakingNews.findMany({
      where: { locale, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.articleTranslation.findMany({
      where: published,
      orderBy: { publishedAt: "desc" },
      take: 14,
      select: cardSelect,
    }),
    db.articleViewDaily.groupBy({
      by: ["articleId"],
      where: { locale, day: { gte: since } },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    }),
    db.video.findMany({
      where: { isVisible: true, translations: { some: { locale } } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      include: { translations: { where: { locale } } },
    }),
    db.homepageSection.findMany({
      where: { isEnabled: true, type: "CATEGORY_BLOCK", categoryId: { not: null } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // One lookup for every article referenced by curation, views and videos.
  const referencedIds = [
    ...featuredRows.map((r) => r.articleId),
    ...breakingRows.map((r) => r.articleId),
    ...viewRows.map((r) => r.articleId),
    ...videoRows.flatMap((r) => (r.articleId ? [r.articleId] : [])),
  ];
  const referenced = await db.articleTranslation.findMany({
    where: { ...published, articleId: { in: referencedIds } },
    select: cardSelect,
  });
  const cardByArticle = new Map(referenced.map((r) => [r.article.id, toCard(r, locale, byId)]));

  const hero = featuredRows.flatMap((r) => cardByArticle.get(r.articleId) ?? []);
  const heroIds = new Set(hero.map((h) => h.id));

  const breaking = breakingRows.flatMap((r) => {
    const card = cardByArticle.get(r.articleId);
    return card ? [{ id: r.id, text: r.customText ?? card.headline, href: card.href }] : [];
  });

  // The hero stories are not repeated in the lists beside and below them.
  const latestCards = latestRows.map((r) => toCard(r, locale, byId)).filter((c) => !heroIds.has(c.id));
  const latest = latestCards.slice(0, 4);
  const topStories = latestCards.slice(4, 8);

  const mostRead = viewRows.flatMap((r) => cardByArticle.get(r.articleId) ?? []).slice(0, 5);

  const videos = videoRows.map((v) => ({
    id: v.id,
    title: v.translations[0].title,
    durationSeconds: v.durationSeconds,
    href: v.articleId ? (cardByArticle.get(v.articleId)?.href ?? null) : null,
  }));

  const categoryBlocks: CategoryBlock[] = [];
  for (const section of sections) {
    const category = section.categoryId ? byId.get(section.categoryId) : undefined;
    if (!category) continue;
    const rows = await db.articleTranslation.findMany({
      where: { ...published, article: inCategories(withDescendants(categories, category.id)) },
      orderBy: { publishedAt: "desc" },
      take: 4,
      select: cardSelect,
    });
    if (rows.length > 0) {
      categoryBlocks.push({ category, articles: rows.map((r) => toCard(r, locale, byId)) });
    }
  }

  return {
    hero,
    breaking,
    latest,
    mostRead,
    videos,
    topStories,
    categoryBlocks,
    quickCategories: categories.filter((c) => !c.parentId).slice(0, 8),
  };
}

// ───────────────────────── category and tag pages ─────────────────────────

export type ListingPage = {
  articles: ArticleCard[];
  page: number;
  hasNext: boolean;
};

export type CategoryPageData = ListingPage & {
  category: CategoryNode;
  crumbs: Crumb[];
  children: CategoryNode[];
};

/** Resolves a URL path such as ["politics", "parliament"] to a category, or null. */
export async function getCategoryPage(
  locale: Locale,
  path: string[],
  page: number,
): Promise<CategoryPageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "categories");

  const categories = await getCategoryIndex(locale);
  const key = path.join("/");
  const category = categories.find((c) => c.path.join("/") === key);
  if (!category) return null;
  const byId = indexById(categories);

  const rows = await db.articleTranslation.findMany({
    where: {
      ...publishedWhere(locale, new Date()),
      article: inCategories(withDescendants(categories, category.id)),
    },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: cardSelect,
  });

  return {
    category,
    crumbs: crumbsFor(category, byId),
    children: categories.filter((c) => c.parentId === category.id),
    articles: rows.slice(0, PAGE_SIZE).map((r) => toCard(r, locale, byId)),
    page,
    hasNext: rows.length > PAGE_SIZE,
  };
}

export type TagPageData = ListingPage & { tag: { name: string; slug: string; href: string } };

export async function getTagPage(locale: Locale, slug: string, page: number): Promise<TagPageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "tags");

  const tag = await db.tagTranslation.findUnique({ where: { locale_slug: { locale, slug } } });
  if (!tag) return null;
  const byId = indexById(await getCategoryIndex(locale));

  const rows = await db.articleTranslation.findMany({
    where: {
      ...publishedWhere(locale, new Date()),
      article: { deletedAt: null, tags: { some: { tagId: tag.tagId } } },
    },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: cardSelect,
  });

  return {
    tag: { name: tag.name, slug: tag.slug, href: `/${locale}/tag/${tag.slug}` },
    articles: rows.slice(0, PAGE_SIZE).map((r) => toCard(r, locale, byId)),
    page,
    hasNext: rows.length > PAGE_SIZE,
  };
}

// ───────────────────────── article page ─────────────────────────

export type ArticlePageData = {
  id: string;
  image: (CardImage & { caption: string | null; credit: string | null }) | null;
  headline: string;
  summary: string;
  body: unknown;
  href: string;
  seoTitle: string | null;
  metaDescription: string | null;
  publishedAt: string;
  updatedAt: string;
  authorName: string | null;
  crumbs: Crumb[];
  tags: { name: string; href: string }[];
  /** URL of the same article in the other edition, when that translation is published. */
  alternate: { locale: Locale; href: string } | null;
  related: ArticleCard[];
};

export async function getArticlePage(locale: Locale, slug: string): Promise<ArticlePageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles", "categories");

  const now = new Date();
  const row = await db.articleTranslation.findFirst({
    where: { ...publishedWhere(locale, now), slug },
    include: {
      article: {
        include: {
          featuredMedia: { select: { storageKey: true, width: true, height: true, credit: true, translations: { select: { locale: true, altText: true, caption: true } } } },
          author: { include: { translations: { where: { locale } } } },
          tags: { include: { tag: { include: { translations: { where: { locale } } } } } },
          translations: {
            where: {
              locale: { not: locale },
              OR: [{ status: "PUBLISHED" }, { status: "SCHEDULED", scheduledAt: { lte: now } }],
            },
            select: { locale: true, slug: true },
          },
        },
      },
    },
  });
  if (!row) return null;

  const categories = await getCategoryIndex(locale);
  const byId = indexById(categories);
  const category = byId.get(row.article.primaryCategoryId);

  let alternate: ArticlePageData["alternate"] = null;
  const sibling = row.article.translations[0];
  if (sibling) {
    const otherCategories = indexById(await getCategoryIndex(sibling.locale));
    alternate = {
      locale: sibling.locale,
      href: articleHref(sibling.locale, otherCategories.get(row.article.primaryCategoryId), sibling.slug),
    };
  }

  const relatedRows = category
    ? await db.articleTranslation.findMany({
        where: {
          ...publishedWhere(locale, now),
          articleId: { not: row.articleId },
          article: inCategories(withDescendants(categories, category.id)),
        },
        orderBy: { publishedAt: "desc" },
        take: 4,
        select: cardSelect,
      })
    : [];

  const publishedAt = row.publishedAt ?? row.scheduledAt ?? row.createdAt;

  const media = row.article.featuredMedia;
  const image = cardImage(media, locale);

  return {
    id: row.articleId,
    image: image && media
      ? { ...image, caption: media.translations.find((t) => t.locale === locale)?.caption ?? null, credit: media.credit }
      : null,
    headline: row.headline,
    summary: row.summary,
    body: row.body,
    href: articleHref(locale, category, row.slug),
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    publishedAt: publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorName: row.article.author?.translations[0]?.displayName ?? null,
    crumbs: category ? crumbsFor(category, byId) : [],
    tags: row.article.tags.flatMap((t) => {
      const tr = t.tag.translations[0];
      return tr ? [{ name: tr.name, href: `/${locale}/tag/${tr.slug}` }] : [];
    }),
    alternate,
    related: relatedRows.map((r) => toCard(r, locale, byId)),
  };
}

/**
 * Where an article's old slug now lives. Editors can change a slug after
 * publishing; links already shared keep working through a permanent redirect.
 */
export async function getRedirectHref(locale: Locale, oldSlug: string): Promise<string | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("articles");
  const r = await db.slugRedirect.findUnique({
    where: { locale_oldPath: { locale, oldPath: oldSlug } },
    select: { translation: { select: { slug: true } } },
  });
  if (!r) return null;
  const article = await getArticlePage(locale, r.translation.slug);
  return article?.href ?? null;
}

/** A few tag slugs, used to prerender tag pages at build time. */
export async function getTagSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("tags");
  const rows = await db.tagTranslation.findMany({ where: { locale }, select: { slug: true }, take: 20 });
  return rows.map((r) => r.slug);
}

// ───────────────────────── public opinions (polls) ─────────────────────────

export type PollOptionView = { id: string; label: string };

export type PollCard = {
  id: string;
  slug: string;
  href: string;
  question: string;
  description: string;
  /** Phase when this was cached. The poll page asks the server for the live phase. */
  phase: "upcoming" | "active" | "closed" | "archived";
  startsAt: string;
  endsAt: string;
  totalVotes: number;
};

export type PollPageData = PollCard & {
  seoTitle: string | null;
  metaDescription: string | null;
  options: PollOptionView[];
  resultsVisibility: "ALWAYS" | "AFTER_VOTE" | "AFTER_CLOSE";
  /** True when the poll also has a translation in the other edition. */
  hasOtherEdition: boolean;
};

const publicPollWhere = { deletedAt: null, isHidden: false, status: { not: "DRAFT" } } satisfies Prisma.PollWhereInput;

function livePhase(poll: { status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "ARCHIVED"; startsAt: Date; endsAt: Date }, now: Date) {
  if (poll.status === "ARCHIVED") return "archived" as const;
  if (poll.status === "CLOSED" || now >= poll.endsAt) return "closed" as const;
  return now < poll.startsAt ? ("upcoming" as const) : ("active" as const);
}

/** Polls that have a translation in this edition, grouped by what they are doing now. */
export async function getPollList(locale: Locale): Promise<{ active: PollCard[]; upcoming: PollCard[]; closed: PollCard[] }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("polls");

  const now = new Date();
  const [rows, counts] = await Promise.all([
    db.poll.findMany({
      where: { ...publicPollWhere, status: { in: ["SCHEDULED", "ACTIVE", "CLOSED"] }, translations: { some: { locale } } },
      orderBy: { endsAt: "desc" },
      take: 60,
      include: { translations: { where: { locale } } },
    }),
    db.pollVote.groupBy({ by: ["pollId"], _count: { _all: true } }),
  ]);
  const totals = new Map(counts.map((c) => [c.pollId, c._count._all]));

  const cards = rows.map((p): PollCard => ({
    id: p.id,
    slug: p.slug,
    href: `/${locale}/public-opinions/${p.slug}`,
    question: p.translations[0].question,
    description: p.translations[0].description,
    phase: livePhase(p, now),
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    totalVotes: totals.get(p.id) ?? 0,
  }));

  return {
    // Ending soonest first for open polls, starting soonest first for upcoming ones.
    active: cards.filter((c) => c.phase === "active").reverse(),
    upcoming: cards.filter((c) => c.phase === "upcoming").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    closed: cards.filter((c) => c.phase === "closed"),
  };
}

export async function getPollPage(locale: Locale, slug: string): Promise<PollPageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("polls");

  const poll = await db.poll.findFirst({
    where: { ...publicPollWhere, slug, translations: { some: { locale } } },
    include: {
      translations: true,
      options: { orderBy: { sortOrder: "asc" }, include: { translations: true } },
    },
  });
  if (!poll) return null;
  const t = poll.translations.find((x) => x.locale === locale)!;
  const totalVotes = await db.pollVote.count({ where: { pollId: poll.id } });

  return {
    id: poll.id,
    slug: poll.slug,
    href: `/${locale}/public-opinions/${poll.slug}`,
    question: t.question,
    description: t.description,
    seoTitle: t.seoTitle,
    metaDescription: t.metaDescription,
    phase: livePhase(poll, new Date()),
    startsAt: poll.startsAt.toISOString(),
    endsAt: poll.endsAt.toISOString(),
    totalVotes,
    resultsVisibility: poll.resultsVisibility,
    options: poll.options.map((o) => ({
      id: o.id,
      label: (o.translations.find((x) => x.locale === locale) ?? o.translations[0])?.label ?? "",
    })),
    hasOtherEdition: poll.translations.some((x) => x.locale !== locale),
  };
}

export async function getPollSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("polls");
  const rows = await db.poll.findMany({
    where: { ...publicPollWhere, translations: { some: { locale } } },
    select: { slug: true },
    orderBy: { endsAt: "desc" },
    take: 30,
  });
  return rows.map((r) => r.slug);
}

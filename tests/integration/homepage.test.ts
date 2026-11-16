import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Public queries use Next.js caching helpers, which only work inside Next.js.
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

import { db } from "@/server/db/client";
import {
  addBlock,
  addBreaking,
  addHeroStory,
  CURATION_LIMITS,
  endBreaking,
  getCuration,
  moveBlock,
  moveHeroStory,
  removeBlock,
  removeHeroStory,
  setBlockEnabled,
  storyChoices,
} from "@/server/admin/homepage";
import { getHomepage } from "@/server/services/content";

/**
 * Homepage curation against the demo database. The demo's own homepage setup
 * is saved first and put back afterwards.
 */

const NOW = new Date();
const HOUR = 3_600_000;
type Saved = {
  featured: Awaited<ReturnType<typeof db.featuredArticle.findMany>>;
  breaking: Awaited<ReturnType<typeof db.breakingNews.findMany>>;
  sections: Awaited<ReturnType<typeof db.homepageSection.findMany>>;
  sectionTr: Awaited<ReturnType<typeof db.homepageSectionTranslation.findMany>>;
};
let saved: Saved;
let stories: { id: string; label: string }[] = [];

async function clear() {
  await db.featuredArticle.deleteMany();
  await db.breakingNews.deleteMany();
  await db.homepageSection.deleteMany();
}

beforeAll(async () => {
  saved = {
    featured: await db.featuredArticle.findMany(),
    breaking: await db.breakingNews.findMany(),
    sections: await db.homepageSection.findMany(),
    sectionTr: await db.homepageSectionTranslation.findMany(),
  };
  await clear();
  stories = await storyChoices("si", NOW);
});

afterAll(async () => {
  await clear();
  await db.featuredArticle.createMany({ data: saved.featured });
  await db.breakingNews.createMany({ data: saved.breaking });
  await db.homepageSection.createMany({ data: saved.sections.map((s) => ({ ...s, settings: s.settings ?? undefined })) });
  await db.homepageSectionTranslation.createMany({ data: saved.sectionTr });
});

describe("fallbacks when nothing is chosen", () => {
  it("leads with the latest stories and shows main sections as blocks", async () => {
    const home = await getHomepage("si");
    expect(home.hero.length).toBeGreaterThan(0);
    expect(home.hero.length).toBeLessThanOrEqual(3);
    expect(home.breaking).toEqual([]);
    expect(home.categoryBlocks.length).toBeGreaterThan(0);
    expect(home.categoryBlocks.length).toBeLessThanOrEqual(4);
    // Hero stories are not repeated in the list beside them.
    const heroIds = new Set(home.hero.map((h) => h.id));
    expect(home.latest.some((c) => heroIds.has(c.id))).toBe(false);
  });
});

describe("hero", () => {
  it("adds, orders and removes stories, and the homepage follows", async () => {
    expect(stories.length).toBeGreaterThanOrEqual(3);
    const [a, b, c] = stories;
    expect((await addHeroStory("si", a.id, null, NOW)).ok).toBe(true);
    expect((await addHeroStory("si", b.id, null, NOW)).ok).toBe(true);
    expect((await addHeroStory("si", c.id, new Date(NOW.getTime() + HOUR), NOW)).ok).toBe(true);
    expect((await addHeroStory("si", a.id, null, NOW)).ok).toBe(false);

    let cur = await getCuration("si", NOW);
    expect(cur.hero.map((h) => h.articleId)).toEqual([a.id, b.id, c.id]);
    await moveHeroStory(cur.hero[2].id, -1);
    cur = await getCuration("si", NOW);
    expect(cur.hero.map((h) => h.articleId)).toEqual([a.id, c.id, b.id]);
    expect((await getHomepage("si")).hero.map((h) => h.id)).toEqual([a.id, c.id, b.id]);

    await removeHeroStory(cur.hero[0].id);
    cur = await getCuration("si", NOW);
    expect(cur.hero.map((h) => h.articleId)).toEqual([c.id, b.id]);
    // The other edition is chosen separately.
    expect((await getCuration("en", NOW)).hero).toEqual([]);
  });

  it("refuses unpublished stories, past end times and more than the limit", async () => {
    const draft = await db.articleTranslation.findFirst({ where: { locale: "si", status: { in: ["DRAFT", "HIDDEN"] } }, select: { articleId: true } });
    if (draft) expect((await addHeroStory("si", draft.articleId, null, NOW)).ok).toBe(false);
    expect((await addHeroStory("si", "nosucharticle", null, NOW)).ok).toBe(false);
    expect((await addHeroStory("si", stories[5].id, new Date(NOW.getTime() - 1000), NOW)).ok).toBe(false);
    while ((await getCuration("si", NOW)).hero.length < CURATION_LIMITS.hero) {
      const used = new Set((await getCuration("si", NOW)).hero.map((h) => h.articleId));
      const next = stories.find((s) => !used.has(s.id))!;
      expect((await addHeroStory("si", next.id, null, NOW)).ok).toBe(true);
    }
    const used = new Set((await getCuration("si", NOW)).hero.map((h) => h.articleId));
    const extra = stories.find((s) => !used.has(s.id))!;
    expect((await addHeroStory("si", extra.id, null, NOW)).ok).toBe(false);
  });

  it("drops ended picks from the homepage", async () => {
    await db.featuredArticle.deleteMany();
    await db.featuredArticle.create({ data: { articleId: stories[0].id, locale: "si", position: 0, endsAt: new Date(Date.now() - 60_000) } });
    const cur = await getCuration("si", new Date());
    expect(cur.hero[0].live).toBe(false);
    // Falls back to the latest stories instead of showing an empty hero.
    expect((await getHomepage("si")).hero.length).toBeGreaterThan(0);
    await db.featuredArticle.deleteMany();
  });
});

describe("breaking-news ticker", () => {
  it("adds items with custom text and expiry, ends them, and refuses bad input", async () => {
    expect((await addBreaking("si", stories[0].id, "  විශේෂ පුවතක්  ", new Date(NOW.getTime() + HOUR), NOW)).ok).toBe(true);
    expect((await addBreaking("si", stories[1].id, "", null, NOW)).ok).toBe(true);
    expect((await addBreaking("si", stories[0].id, "", null, NOW)).ok).toBe(false);
    expect((await addBreaking("si", stories[2].id, "x".repeat(CURATION_LIMITS.breakingText + 1), null, NOW)).ok).toBe(false);
    expect((await addBreaking("si", stories[2].id, "", new Date(NOW.getTime() - 1), NOW)).ok).toBe(false);

    const home = await getHomepage("si");
    expect(home.breaking).toHaveLength(2);
    expect(home.breaking.some((b) => b.text === "විශේෂ පුවතක්")).toBe(true);
    expect(home.breaking.some((b) => b.text === stories[1].label)).toBe(true);

    const cur = await getCuration("si", NOW);
    for (const b of cur.breaking) await endBreaking(b.id);
    expect((await getCuration("si", NOW)).breaking).toEqual([]);
    expect((await getHomepage("si")).breaking).toEqual([]);
    // Ended items are kept as history, not deleted.
    expect(await db.breakingNews.count({ where: { isActive: false } })).toBeGreaterThanOrEqual(2);
  });
});

describe("category blocks", () => {
  it("adds, orders, hides and removes blocks shared by both editions", async () => {
    const cats = await db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, take: 3, select: { id: true } });
    for (const c of cats) expect((await addBlock(c.id)).ok).toBe(true);
    expect((await addBlock(cats[0].id)).ok).toBe(false);
    expect((await addBlock("nosuchcategory")).ok).toBe(false);

    let blocks = (await getCuration("en", NOW)).blocks;
    expect(blocks.map((b) => b.categoryId)).toEqual(cats.map((c) => c.id));
    await moveBlock(blocks[0].id, 1);
    blocks = (await getCuration("si", NOW)).blocks;
    expect(blocks.map((b) => b.categoryId)).toEqual([cats[1].id, cats[0].id, cats[2].id]);

    await setBlockEnabled(blocks[0].id, false);
    const shown = (await getHomepage("si")).categoryBlocks.map((b) => b.category.id);
    expect(shown).not.toContain(cats[1].id);
    // Hiding every block keeps the homepage without blocks (no fallback once set up).
    for (const b of (await getCuration("si", NOW)).blocks) await setBlockEnabled(b.id, false);
    expect((await getHomepage("si")).categoryBlocks).toEqual([]);

    for (const b of (await getCuration("si", NOW)).blocks) await removeBlock(b.id);
    expect((await getCuration("si", NOW)).blocks).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

import { db } from "@/server/db/client";
import { binArticle, createArticle, getArticleForEdit, saveArticle, type SaveIntent } from "@/server/admin/articles";
import { saveCategory } from "@/server/admin/taxonomy";
import { articleSitemap, articleSitemapCount, newsSitemap, pagesSitemap } from "@/server/services/sitemaps";
import { getArticlePage } from "@/server/services/content";
import { getSettings, saveSettings } from "@/server/admin/settings";
import { getSeoSettings } from "@/lib/seo/site";

/**
 * Sitemaps, Google News sitemap and the "last significant edit" date, against
 * the real database. Articles here use real clock times because the sitemaps
 * read the current time.
 */

const RUN = `seo${Date.now().toString(36)}`;
let categoryId = "";
let catSlug = "";
let n = 0;
const slug = () => `${RUN}-${n++}`;
const HOUR = 3_600_000;
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function article(opts: { intent: SaveIntent; headline?: string; locale?: "si" | "en"; scheduledAt?: Date }) {
  const locale = opts.locale ?? "en";
  const s = slug();
  const c = await createArticle({ locale, headline: opts.headline ?? `Headline ${s}`, slug: s, primaryCategoryId: categoryId }, new Date());
  if (!c.ok) throw new Error(JSON.stringify(c.errors));
  const t = (await getArticleForEdit(c.id))!.translations[locale]!;
  const r = await saveArticle(
    {
      articleId: c.id,
      locale,
      expectedUpdatedAt: t.updatedAt.toISOString(),
      intent: opts.intent,
      scheduledAt: opts.scheduledAt ?? null,
      shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
      translation: { headline: opts.headline ?? `Headline ${s}`, summary: "Summary", body: doc("Text"), slug: s, seoTitle: "", metaDescription: "" },
    },
    new Date(),
  );
  if (!r.ok) throw new Error(r.message);
  return { id: c.id, slug: s, path: `/${locale}/${catSlug}/${s}` };
}

async function edit(id: string, change: { headline?: string; intent?: SaveIntent }, now = new Date()) {
  const a = (await getArticleForEdit(id))!;
  const t = a.translations.en!;
  const r = await saveArticle(
    {
      articleId: id,
      locale: "en",
      expectedUpdatedAt: t.updatedAt.toISOString(),
      intent: change.intent ?? "save",
      scheduledAt: null,
      shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
      translation: { headline: change.headline ?? t.headline, summary: t.summary, body: t.body, slug: t.slug, seoTitle: "", metaDescription: "" },
    },
    now,
  );
  if (!r.ok) throw new Error(r.message);
}

const modifiedAt = async (id: string) => (await db.articleTranslation.findFirstOrThrow({ where: { articleId: id, locale: "en" } })).modifiedAt;
const inSitemap = async (path: string) => {
  const parts = await articleSitemapCount("en");
  for (let p = 1; p <= parts; p++) if ((await articleSitemap("en", p)).some((u) => u.path === path)) return true;
  return false;
};

let published: Awaited<ReturnType<typeof article>>;

beforeAll(async () => {
  catSlug = `${RUN}-cat`;
  const cat = await saveCategory({ id: null, parentId: null, sortOrder: 99, isVisible: true, si: { name: "පරීක්ෂණ", slug: catSlug }, en: { name: "Test", slug: catSlug } });
  if (!cat.ok) throw new Error("setup failed");
  categoryId = cat.id;
  published = await article({ intent: "publish", headline: "Fresh <news> & more" });
});

afterAll(async () => {
  await db.article.deleteMany({ where: { primaryCategoryId: categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.siteSettings.update({ where: { id: 1 }, data: { socialLinks: {}, defaultShareMediaId: null } }).catch(() => undefined);
});

describe("article sitemaps", () => {
  it("lists published articles at their canonical address, and nothing else", async () => {
    const draft = await article({ intent: "save" });
    const future = await article({ intent: "schedule", scheduledAt: new Date(Date.now() + 5 * HOUR) });
    const binned = await article({ intent: "publish" });
    await binArticle(binned.id, new Date());

    expect(await inSitemap(published.path)).toBe(true);
    expect(await inSitemap(draft.path)).toBe(false);
    expect(await inSitemap(future.path)).toBe(false);
    expect(await inSitemap(binned.path)).toBe(false);

    const unpub = await article({ intent: "publish" });
    expect(await inSitemap(unpub.path)).toBe(true);
    await edit(unpub.id, { intent: "unpublish" });
    expect(await inSitemap(unpub.path)).toBe(false);
  });

  it("uses the publication time as lastmod until a significant edit", async () => {
    const row = await db.articleTranslation.findFirstOrThrow({ where: { articleId: published.id, locale: "en" } });
    const entry = async () => (await articleSitemap("en", 1)).find((u) => u.path === published.path)!;
    expect((await entry()).lastmod).toBe(row.publishedAt!.toISOString());
    expect(await modifiedAt(published.id)).toBeNull();

    // A save that changes nothing visible is not a modification.
    await edit(published.id, {});
    expect(await modifiedAt(published.id)).toBeNull();

    const later = new Date(Date.now() + 60_000);
    await edit(published.id, { headline: "Fresh <news> & more, updated" }, later);
    expect((await modifiedAt(published.id))?.toISOString()).toBe(later.toISOString());
    expect((await entry()).lastmod).toBe(later.toISOString());

    // The article page and its structured data use the same date.
    const page = await getArticlePage("en", published.slug);
    expect(page!.updatedAt).toBe(later.toISOString());
    expect(page!.publishedAt).toBe(row.publishedAt!.toISOString());
  });

  it("does not count edits to an unpublished draft", async () => {
    const draft = await article({ intent: "save" });
    await edit(draft.id, { headline: "Changed while still a draft" });
    expect(await modifiedAt(draft.id)).toBeNull();
  });
});

describe("Google News sitemap", () => {
  it("contains only articles first published in the last two days, with the original time", async () => {
    const old = await article({ intent: "publish" });
    await db.articleTranslation.updateMany({ where: { articleId: old.id }, data: { publishedAt: new Date(Date.now() - 49 * HOUR) } });
    // Editing an old article must not bring it back as news.
    await edit(old.id, { headline: "Old story, corrected" });
    const si = await article({ intent: "publish", locale: "si", headline: "සිංහල පුවත" });

    const { publication, items } = await newsSitemap();
    expect(publication).toBe("RSnewslk.com");
    const mine = items.filter((i) => i.path.includes(RUN));
    expect(mine.map((i) => i.path)).toContain(published.path);
    expect(mine.map((i) => i.path)).toContain(si.path);
    expect(mine.map((i) => i.path)).not.toContain(old.path);
    expect(mine.find((i) => i.path === si.path)).toMatchObject({ locale: "si", title: "සිංහල පුවත" });

    const row = await db.articleTranslation.findFirstOrThrow({ where: { articleId: published.id, locale: "en" } });
    expect(mine.find((i) => i.path === published.path)!.publishedAt).toBe(row.publishedAt!.toISOString());
    for (const i of items) expect(Date.now() - Date.parse(i.publishedAt)).toBeLessThanOrEqual(48 * HOUR);
    expect(items.length).toBeLessThanOrEqual(1000);
  });
});

describe("pages sitemap", () => {
  it("lists homes and visible sections in both languages", async () => {
    const urls = (await pagesSitemap()).map((u) => u.path);
    expect(urls).toContain("/si");
    expect(urls).toContain("/en");
    expect(urls).toContain(`/en/${catSlug}`);
    expect(urls).toContain(`/si/${catSlug}`);
    expect(urls).toContain("/en/videos");
    expect(urls.some((u) => u.startsWith("/admin") || u.includes("/api/"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("settings", () => {
  it("validates and stores official social profiles", async () => {
    const bad = await saveSettings({ social: { facebook: "https://evil.example/x" }, defaultShareMediaId: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.facebook).toBeTruthy();

    expect((await saveSettings({ social: { facebook: "https://www.facebook.com/rsnewslk", x: "" }, defaultShareMediaId: "" })).ok).toBe(true);
    expect((await getSettings()).social).toEqual({ facebook: "https://www.facebook.com/rsnewslk" });
    expect((await getSeoSettings()).sameAs).toEqual(["https://www.facebook.com/rsnewslk"]);
    expect((await getSeoSettings()).defaultImage.url).toBe("http://localhost:3000/brand/og-default.jpg");

    expect((await saveSettings({ social: {}, defaultShareMediaId: "missing" })).ok).toBe(false);
  });
});

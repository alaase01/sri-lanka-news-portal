import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { binArticle, createArticle, getArticleForEdit, listArticles, restoreArticle, restoreRevision, saveArticle, type SaveInput } from "@/server/admin/articles";
import { deleteCategory, deleteTag, saveCategory, saveTag } from "@/server/admin/taxonomy";

/**
 * Article, category and tag administration against a real database. Every
 * record uses a run-specific slug prefix and is removed afterwards.
 */

const RUN = `t${Date.now().toString(36)}`;
const NOW = new Date("2026-11-16T06:00:00Z");
const MIN = 60_000;
let n = 0;
const slug = (s = "a") => `${RUN}-${s}-${n++}`;

let categoryId = "";
let otherCategoryId = "";
let tagId = "";

const body = (words: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] });

async function newArticle(locale: "si" | "en" = "si") {
  const r = await createArticle({ locale, headline: "පරීක්ෂණ ශීර්ෂය", slug: slug(), primaryCategoryId: categoryId }, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

async function input(articleId: string, locale: "si" | "en", over: Partial<SaveInput> & { t?: Partial<SaveInput["translation"]> } = {}): Promise<SaveInput> {
  const a = await getArticleForEdit(articleId);
  const t = a?.translations[locale];
  return {
    articleId,
    locale,
    expectedUpdatedAt: t ? t.updatedAt.toISOString() : null,
    intent: "save",
    scheduledAt: null,
    shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
    ...over,
    translation: {
      headline: t?.headline ?? "Headline",
      summary: "",
      body: body("some article text"),
      slug: t?.slug ?? slug(),
      seoTitle: "",
      metaDescription: "",
      ...over.t,
    },
  };
}

beforeAll(async () => {
  const c = await saveCategory({
    id: null,
    parentId: null,
    sortOrder: 99,
    isVisible: false,
    si: { name: "පරීක්ෂණ", slug: `${RUN}-cat` },
    en: { name: "Test", slug: `${RUN}-cat` },
  });
  const c2 = await saveCategory({ id: null, parentId: null, sortOrder: 99, isVisible: false, si: { name: "දෙවන", slug: `${RUN}-cat2` }, en: { name: "Second", slug: `${RUN}-cat2` } });
  const tg = await saveTag({ id: null, si: { name: "ටැග්", slug: `${RUN}-tag` }, en: { name: "Tag", slug: `${RUN}-tag` } });
  if (!c.ok || !c2.ok || !tg.ok) throw new Error("setup failed");
  categoryId = c.id;
  otherCategoryId = c2.id;
  tagId = tg.id;
});

afterAll(async () => {
  await db.article.deleteMany({ where: { primaryCategoryId: { in: [categoryId, otherCategoryId] } } });
  await db.tag.deleteMany({ where: { translations: { some: { slug: { startsWith: RUN } } } } });
  await db.category.deleteMany({ where: { translations: { some: { slug: { startsWith: RUN } } }, parentId: { not: null } } });
  await db.category.deleteMany({ where: { translations: { some: { slug: { startsWith: RUN } } } } });
});

describe("creating articles", () => {
  it("creates a draft with a first revision", async () => {
    const id = await newArticle();
    const a = await getArticleForEdit(id);
    expect(a?.translations.si?.status).toBe("DRAFT");
    expect(a?.translations.en).toBeUndefined();
    expect(a?.translations.si?.revisions).toHaveLength(1);
  });

  it("rejects bad, reserved and duplicate slugs and a missing category", async () => {
    const taken = slug();
    await createArticle({ locale: "si", headline: "x", slug: taken, primaryCategoryId: categoryId }, NOW);
    for (const [s, field] of [["Bad Slug", "slug"], ["page", "slug"], [taken, "slug"], [`${RUN}-cat`, "slug"]] as const) {
      const r = await createArticle({ locale: "si", headline: "x", slug: s, primaryCategoryId: categoryId }, NOW);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.errors[field], s).toBeTruthy();
    }
    const noCat = await createArticle({ locale: "si", headline: "x", slug: slug(), primaryCategoryId: "nope" }, NOW);
    expect(!noCat.ok && noCat.errors.primaryCategoryId).toBeTruthy();
    // The same slug may be used once in each language.
    const otherLang = await createArticle({ locale: "en", headline: "x", slug: taken, primaryCategoryId: categoryId }, NOW);
    expect(otherLang.ok).toBe(true);
  });
});

describe("saving and publishing", () => {
  it("saves text, shared settings and a cleaned body, keeping draft status", async () => {
    const id = await newArticle();
    const r = await saveArticle(
      await input(id, "si", {
        shared: { primaryCategoryId: categoryId, categoryIds: [otherCategoryId, categoryId], tagIds: [tagId, tagId], authorId: null, featuredMediaId: null },
        t: { headline: "  නව ශීර්ෂය  ", body: { type: "doc", content: [{ type: "codeBlock" }, { type: "paragraph", content: [{ type: "text", text: "ok" }] }] } },
      }),
      NOW,
    );
    expect(r.ok).toBe(true);
    const a = await getArticleForEdit(id);
    expect(a?.translations.si?.headline).toBe("නව ශීර්ෂය");
    expect(a?.translations.si?.status).toBe("DRAFT");
    expect(a?.translations.si?.body).toEqual(body("ok"));
    // The primary category is not repeated in the extra list; duplicates collapse.
    expect(a?.categoryIds).toEqual([otherCategoryId]);
    expect(a?.tagIds).toEqual([tagId]);
  });

  it("refuses to overwrite a version changed after it was opened", async () => {
    const id = await newArticle();
    const stale = await input(id, "si");
    expect((await saveArticle(await input(id, "si", { t: { headline: "first tab" } }), NOW)).ok).toBe(true);
    const r = await saveArticle({ ...stale, translation: { ...stale.translation, headline: "second tab" } }, NOW);
    expect(r.ok).toBe(false);
    expect((await getArticleForEdit(id))?.translations.si?.headline).toBe("first tab");
  });

  it("publishes, keeps the first publication time, and unpublishes to hidden", async () => {
    const id = await newArticle();
    const p1 = await saveArticle(await input(id, "si", { intent: "publish" }), NOW);
    expect(p1.ok && p1.status).toBe("PUBLISHED");
    const later = new Date(NOW.getTime() + 60 * MIN);
    await saveArticle(await input(id, "si", { intent: "save", t: { headline: "edited" } }), later);
    expect((await getArticleForEdit(id))?.translations.si?.publishedAt).toEqual(NOW);

    const u = await saveArticle(await input(id, "si", { intent: "unpublish" }), later);
    expect(u.ok && u.status).toBe("HIDDEN");
    const again = await saveArticle(await input(id, "si", { intent: "publish" }), new Date(later.getTime() + MIN));
    expect(again.ok && again.status).toBe("PUBLISHED");
    expect((await getArticleForEdit(id))?.translations.si?.publishedAt).toEqual(NOW);
  });

  it("will not publish an empty article, and leaves the stored version unchanged", async () => {
    const id = await newArticle();
    const r = await saveArticle(await input(id, "si", { intent: "publish", t: { body: { type: "doc", content: [{ type: "paragraph" }] } } }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBeTruthy();
    expect((await getArticleForEdit(id))?.translations.si?.status).toBe("DRAFT");
  });

  it("schedules only in the future, and unscheduling returns to draft", async () => {
    const id = await newArticle();
    const past = await saveArticle(await input(id, "si", { intent: "schedule", scheduledAt: new Date(NOW.getTime() - MIN) }), NOW);
    expect(!past.ok && past.errors.scheduledAt).toBeTruthy();

    const when = new Date(NOW.getTime() + 120 * MIN);
    const s = await saveArticle(await input(id, "si", { intent: "schedule", scheduledAt: when }), NOW);
    expect(s.ok && s.status).toBe("SCHEDULED");
    const t = (await getArticleForEdit(id))?.translations.si;
    expect(t?.scheduledAt).toEqual(when);
    expect(t?.publishedAt).toEqual(when);

    const c = await saveArticle(await input(id, "si", { intent: "unpublish" }), NOW);
    expect(c.ok && c.status).toBe("DRAFT");
    expect((await getArticleForEdit(id))?.translations.si?.publishedAt).toBeNull();
  });

  it("publishing a scheduled article early uses the current time", async () => {
    const id = await newArticle();
    await saveArticle(await input(id, "si", { intent: "schedule", scheduledAt: new Date(NOW.getTime() + 600 * MIN) }), NOW);
    await saveArticle(await input(id, "si", { intent: "publish" }), NOW);
    const t = (await getArticleForEdit(id))?.translations.si;
    expect(t?.status).toBe("PUBLISHED");
    expect(t?.publishedAt).toEqual(NOW);
    expect(t?.scheduledAt).toBeNull();
  });

  it("adds the second language independently", async () => {
    const id = await newArticle("si");
    await saveArticle(await input(id, "si", { intent: "publish" }), NOW);
    const r = await saveArticle(await input(id, "en", { t: { headline: "English version", slug: slug("en") } }), NOW);
    expect(r.ok).toBe(true);
    const a = await getArticleForEdit(id);
    expect(a?.translations.en?.status).toBe("DRAFT");
    expect(a?.translations.si?.status).toBe("PUBLISHED");
  });
});

describe("slug changes", () => {
  it("redirects the old slug after publication, but not for drafts", async () => {
    const draftId = await newArticle();
    const draftOld = (await getArticleForEdit(draftId))!.translations.si!.slug;
    await saveArticle(await input(draftId, "si", { t: { slug: slug("draft-new") } }), NOW);
    expect(await db.slugRedirect.count({ where: { locale: "si", oldPath: draftOld } })).toBe(0);

    const id = await newArticle();
    await saveArticle(await input(id, "si", { intent: "publish" }), NOW);
    const oldSlug = (await getArticleForEdit(id))!.translations.si!.slug;
    const newSlug = slug("renamed");
    const r = await saveArticle(await input(id, "si", { t: { slug: newSlug } }), NOW);
    expect(r.ok && r.slugChanged).toBe(true);
    const redirect = await db.slugRedirect.findUnique({ where: { locale_oldPath: { locale: "si", oldPath: oldSlug } }, include: { translation: true } });
    expect(redirect?.translation.slug).toBe(newSlug);

    // Another article may later take the freed slug; the redirect then gives way.
    const other = await newArticle();
    const take = await saveArticle(await input(other, "si", { t: { slug: oldSlug } }), NOW);
    expect(take.ok).toBe(true);
    expect(await db.slugRedirect.count({ where: { locale: "si", oldPath: oldSlug } })).toBe(0);
  });
});

describe("revisions and the bin", () => {
  it("restores an earlier revision's text without changing status", async () => {
    const id = await newArticle();
    await saveArticle(await input(id, "si", { intent: "publish", t: { headline: "version one", body: body("one") } }), NOW);
    await saveArticle(await input(id, "si", { t: { headline: "version two", body: body("two") } }), NOW);
    const revs = (await getArticleForEdit(id))!.translations.si!.revisions;
    const v1 = revs.find((r) => r.headline === "version one")!;
    const r = await restoreRevision(v1.id);
    expect(r.ok).toBe(true);
    const t = (await getArticleForEdit(id))!.translations.si!;
    expect(t.headline).toBe("version one");
    expect(t.body).toEqual(body("one"));
    expect(t.status).toBe("PUBLISHED");
    expect(t.revisions[0].note).toMatch(/^Restored/);
  });

  it("moves to the bin and back, and blocks editing while binned", async () => {
    const id = await newArticle();
    expect(await binArticle(id, NOW)).toBe(true);
    expect(await binArticle(id, NOW)).toBe(false);
    const list = await listArticles({ deleted: true, q: "පරීක්ෂණ" });
    expect(list.rows.some((r) => r.id === id)).toBe(true);
    const blocked = await saveArticle(await input(id, "si"), NOW);
    expect(blocked.ok).toBe(false);
    expect(await restoreArticle(id)).toBe(true);
    expect((await listArticles({ q: "පරීක්ෂණ", categoryId })).rows.some((r) => r.id === id)).toBe(true);
  });

  it("filters the list by status, language and missing translation", async () => {
    const id = await newArticle("si");
    const missingEn = await listArticles({ status: "MISSING", locale: "en", categoryId });
    expect(missingEn.rows.some((r) => r.id === id)).toBe(true);
    const drafts = await listArticles({ status: "DRAFT", locale: "si", categoryId });
    expect(drafts.rows.every((r) => r.versions.si?.status === "DRAFT")).toBe(true);
  });
});

describe("categories", () => {
  it("enforces three levels and prevents cycles", async () => {
    const mk = async (parentId: string | null, s: string) => {
      const r = await saveCategory({ id: null, parentId, sortOrder: 0, isVisible: true, si: { name: s, slug: `${RUN}-${s}` }, en: { name: s, slug: `${RUN}-${s}` } });
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      return r.id;
    };
    const l1 = await mk(null, "l1");
    const l2 = await mk(l1, "l2");
    const l3 = await mk(l2, "l3");
    const tooDeep = await saveCategory({ id: null, parentId: l3, sortOrder: 0, isVisible: true, si: { name: "x", slug: `${RUN}-l4` }, en: { name: "x", slug: `${RUN}-l4` } });
    expect(!tooDeep.ok && tooDeep.errors.parentId).toBeTruthy();

    // Moving l1 under its own grandchild would create a loop.
    const loop = await saveCategory({ id: l1, parentId: l3, sortOrder: 0, isVisible: true, si: { name: "l1", slug: `${RUN}-l1` }, en: { name: "l1", slug: `${RUN}-l1` } });
    expect(!loop.ok && loop.errors.parentId).toBeTruthy();

    // A two-level subtree cannot move under a second-level category.
    const other = await mk(null, "o1");
    const o2 = await mk(other, "o2");
    const move = await saveCategory({ id: l2, parentId: o2, sortOrder: 0, isVisible: true, si: { name: "l2", slug: `${RUN}-l2` }, en: { name: "l2", slug: `${RUN}-l2` } });
    expect(!move.ok && move.errors.parentId).toBeTruthy();

    // Delete only when empty.
    const blocked = await deleteCategory(l2);
    expect(blocked.ok).toBe(false);
    expect((await deleteCategory(l3)).ok).toBe(true);
  });

  it("requires both languages and rejects reserved or clashing slugs", async () => {
    const r = await saveCategory({ id: null, parentId: null, sortOrder: 0, isVisible: true, si: { name: "", slug: "tag" }, en: { name: "x", slug: `${RUN}-cat` } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors["si.name"]).toBeTruthy();
      expect(r.errors["si.slug"]).toBeTruthy();
      expect(r.errors["en.slug"]).toBeTruthy();
    }
  });

  it("refuses to delete a category that articles use", async () => {
    await newArticle();
    expect((await deleteCategory(categoryId)).ok).toBe(false);
  });
});

describe("tags", () => {
  it("allows a single language and removes the other on edit", async () => {
    const r = await saveTag({ id: null, si: { name: "සිංහල පමණි", slug: `${RUN}-si-only` }, en: { name: "", slug: "" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const both = await saveTag({ id: r.id, si: { name: "සිංහල", slug: `${RUN}-si-only` }, en: { name: "Both", slug: `${RUN}-both` } });
    expect(both.ok).toBe(true);
    const enOnly = await saveTag({ id: r.id, si: { name: "", slug: "" }, en: { name: "Both", slug: `${RUN}-both` } });
    expect(enOnly.ok).toBe(true);
    expect(await db.tagTranslation.count({ where: { tagId: r.id } })).toBe(1);
  });

  it("rejects an empty tag and duplicate slugs, and deletes cleanly from articles", async () => {
    const empty = await saveTag({ id: null, si: { name: "", slug: "" }, en: { name: "", slug: "" } });
    expect(!empty.ok && empty.errors.form).toBeTruthy();
    const dup = await saveTag({ id: null, si: { name: "x", slug: `${RUN}-tag` }, en: { name: "", slug: "" } });
    expect(!dup.ok && dup.errors["si.slug"]).toBeTruthy();

    const t = await saveTag({ id: null, si: { name: "මකන්න", slug: `${RUN}-del` }, en: { name: "", slug: "" } });
    if (!t.ok) throw new Error("tag");
    const id = await newArticle();
    await saveArticle(await input(id, "si", { shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [t.id], authorId: null, featuredMediaId: null } }), NOW);
    expect(await deleteTag(t.id)).toBe(true);
    expect((await getArticleForEdit(id))?.tagIds).toEqual([]);
  });
});

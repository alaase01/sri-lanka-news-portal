import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

import { db } from "@/server/db/client";
import { getPageForEdit, listPages, savePage, type PageSaveInput } from "@/server/admin/pages";
import { getStaticPage } from "@/server/services/pages";
import { getSiteChrome } from "@/server/services/content";
import { bodyText, type BodyDoc } from "@/lib/content/body";

/**
 * Static pages against the real database. The five pages come from the
 * migration; this test changes the "about" and "editorial" pages and puts them
 * back exactly as they were afterwards.
 */

const RUN = `sp${Date.now().toString(36)}`;
let adminId = "";
let snapshot: Awaited<ReturnType<typeof db.staticPageTranslation.findMany>> = [];
const NOW = new Date("2026-11-18T03:00:00Z");
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

const doc = (text: string, align?: "center"): BodyDoc => ({
  type: "doc",
  content: [{ type: "paragraph", ...(align ? { attrs: { textAlign: align } } : {}), content: [{ type: "text", text }] }],
});

async function version(key: string, locale: "si" | "en") {
  return (await getPageForEdit(key))!.versions[locale];
}

async function save(over: Partial<PageSaveInput> & { key: string; locale: "si" | "en" }, now = later(1)) {
  const v = await version(over.key, over.locale);
  return savePage(
    {
      expectedUpdatedAt: v ? v.updatedAt.toISOString() : null,
      intent: "save",
      title: v?.title ?? "",
      body: v?.body ?? doc(""),
      seoTitle: v?.seoTitle ?? "",
      metaDescription: v?.metaDescription ?? "",
      ...over,
    },
    adminId,
    now,
  );
}

beforeAll(async () => {
  adminId = (await db.admin.create({ data: { email: `${RUN}@example.com`, passwordHash: "x" } })).id;
  snapshot = await db.staticPageTranslation.findMany({ where: { page: { key: { in: ["about", "editorial"] } } } });
  expect(snapshot.length).toBe(4); // created by the migration
});

afterAll(async () => {
  await db.staticPageTranslation.deleteMany({ where: { page: { key: { in: ["about", "editorial"] } } } });
  for (const row of snapshot) {
    await db.staticPageTranslation.create({
      data: { ...row, body: row.body as object, publishedBody: (row.publishedBody ?? undefined) as object | undefined },
    });
  }
  await db.auditLog.deleteMany({ where: { adminId } });
  await db.admin.delete({ where: { id: adminId } });
});

describe("static pages", () => {
  it("starts with five unpublished pages in both languages", async () => {
    const list = await listPages();
    expect(list.map((p) => p.slug)).toEqual(["about", "contact", "privacy-policy", "terms-and-conditions", "editorial-policy"]);
    for (const p of list) {
      expect(p.versions.si?.state).toMatch(/draft|published|changed/);
      expect(p.versions.en?.title).toBeTruthy();
    }
    expect(list.find((p) => p.key === "privacy")!.versions.en!.placeholders).toBeGreaterThan(5);
  });

  it("will not publish while placeholders remain", async () => {
    expect((await save({ key: "about", locale: "en", title: "About", body: doc("Email: [[email address]]") }, later(0))).ok).toBe(true);
    const r = await save({ key: "about", locale: "en", intent: "publish" }, later(0.5));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/placeholder/);
      expect(r.placeholders![0]).toMatch(/^\[\[/);
    }
    expect(await getStaticPage("en", "about")).toBeNull();
  });

  it("publishes, keeps drafts off the site, and links published pages in the footer", async () => {
    const r = await save({ key: "about", locale: "en", intent: "publish", title: "About RSnewslk", body: doc("We publish news.", "center"), seoTitle: "About", metaDescription: "Who we are" });
    expect(r).toEqual({ ok: true, slug: "about" });

    const live = await getStaticPage("en", "about");
    expect(live).toMatchObject({ kind: "page", title: "About RSnewslk", seoTitle: "About", metaDescription: "Who we are", otherPublished: false });
    if (live?.kind === "page") expect(live.body.content[0].attrs?.textAlign).toBe("center");
    expect((await version("about", "en"))!.state).toBe("published");
    expect((await version("about", "en"))!.updatedBy).toBe(`${RUN}@example.com`);

    // A draft save changes the editor's copy only.
    expect((await save({ key: "about", locale: "en", title: "About (draft)", body: doc("Draft text.") }, later(2))).ok).toBe(true);
    const still = await getStaticPage("en", "about");
    expect(still?.kind === "page" && still.title).toBe("About RSnewslk");
    expect((await version("about", "en"))!.state).toBe("changed");

    expect((await getSiteChrome("en")).pages).toContainEqual({ key: "about", href: "/en/about" });
    expect((await getSiteChrome("si")).pages.some((p) => p.key === "about")).toBe(false);
  });

  it("keeps the languages separate and links to the published one", async () => {
    const si = await version("about", "si");
    const other = await getStaticPage("si", "about");
    expect(other).toEqual({ kind: "otherLanguageOnly", key: "about", otherTitle: "About RSnewslk" });
    // Editing English never touched Sinhala.
    expect((await version("about", "si"))!.title).toBe(si!.title);
    expect(bodyText((await version("about", "si"))!.body)).toContain("RSnewslk.com");
  });

  it("unpublishes", async () => {
    expect((await save({ key: "about", locale: "en", intent: "unpublish" }, later(3))).ok).toBe(true);
    expect(await getStaticPage("en", "about")).toBeNull();
    expect((await getSiteChrome("en")).pages.some((p) => p.key === "about")).toBe(false);
    expect((await version("about", "en"))!.state).toBe("draft");
  });

  it("refuses to save over changes made elsewhere", async () => {
    const v = await version("editorial", "si");
    const first = await savePage({ key: "editorial", locale: "si", expectedUpdatedAt: v!.updatedAt.toISOString(), intent: "save", title: "A", body: doc("a"), seoTitle: "", metaDescription: "" }, adminId, later(4));
    expect(first.ok).toBe(true);
    const second = await savePage({ key: "editorial", locale: "si", expectedUpdatedAt: v!.updatedAt.toISOString(), intent: "save", title: "B", body: doc("b"), seoTitle: "", metaDescription: "" }, adminId, later(5));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/changed somewhere else/);
    expect((await version("editorial", "si"))!.title).toBe("A");
  });

  it("validates and cleans what is saved", async () => {
    expect((await save({ key: "editorial", locale: "en", title: "x".repeat(201) })).ok).toBe(false);
    expect((await save({ key: "editorial", locale: "en", body: "<script>alert(1)</script>" })).ok).toBe(false);
    expect((await save({ key: "editorial", locale: "en", intent: "publish", title: "" })).ok).toBe(false);
    expect((await savePage({ key: "missing", locale: "en", expectedUpdatedAt: null, intent: "save", title: "x", body: doc("x"), seoTitle: "", metaDescription: "" }, adminId, NOW)).ok).toBe(false);

    const dirty = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "center", style: "x" }, content: [{ type: "text", text: "Hi", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "evil()" }] },
      ],
    };
    expect((await save({ key: "editorial", locale: "en", body: dirty }, later(6))).ok).toBe(true);
    const stored = JSON.stringify((await version("editorial", "en"))!.body);
    expect(stored).not.toMatch(/javascript|codeBlock|style/);
    expect(stored).toContain("center");
  });

  it("shows nothing for a page published in neither language", async () => {
    expect(await getStaticPage("si", "editorial-policy")).toBeNull();
    expect(await getStaticPage("en", "no-such-page")).toBeNull();
  });
});

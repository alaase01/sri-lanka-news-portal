import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The public queries use Next.js caching helpers, which only work inside Next.js.
// Here they do nothing, so the queries read the database directly.
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));
import sharp from "sharp";
import { db } from "@/server/db/client";
import { changeVideoState, getVideoForEdit, importYouTubeThumbnail, listVideos, saveVideo, type VideoInput } from "@/server/admin/videos";
import { deleteMedia } from "@/server/media/core";
import { getVideoList, getVideoPage } from "@/server/services/content";

/** Video administration and public reads. Slugs use a run-specific prefix. */

const RUN = `t${Date.now().toString(36)}`;
const NOW = new Date();
const MIN = 60_000;
const ID = "dQw4w9WgXcQ";
let n = 0;
const blank = { title: "", description: "", slug: "", seoTitle: "", metaDescription: "" };
const text = (title: string, slug = `${RUN}-v-${n++}`) => ({ ...blank, title, slug });
let tagId = "";
const createdMedia: string[] = [];

function input(over: Partial<VideoInput> = {}): VideoInput {
  return {
    id: null,
    expectedUpdatedAt: null,
    intent: "save",
    youtube: `https://youtu.be/${ID}`,
    duration: 204,
    scheduledAt: null,
    thumbnailMediaId: null,
    articleId: null,
    categoryId: null,
    tagIds: [],
    isFeatured: false,
    si: text("පරීක්ෂණ වීඩියෝව"),
    en: blank,
    ...over,
  };
}

async function edit(id: string): Promise<VideoInput> {
  const v = (await getVideoForEdit(id))!;
  return {
    id,
    expectedUpdatedAt: v.updatedAt.toISOString(),
    intent: "save",
    youtube: v.youtubeId,
    duration: v.durationSeconds,
    scheduledAt: null,
    thumbnailMediaId: v.thumbnailMediaId,
    articleId: v.articleId,
    categoryId: v.categoryId,
    tagIds: v.tagIds,
    isFeatured: v.isFeatured,
    si: v.translations.si ?? blank,
    en: v.translations.en ?? blank,
  };
}

async function create(over: Partial<VideoInput> = {}) {
  const r = await saveVideo(input(over), NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

beforeAll(async () => {
  tagId = (await db.tag.create({ data: { translations: { create: { locale: "si", name: "වීඩියෝ ටැගය", slug: `${RUN}-tag` } } } })).id;
});

afterAll(async () => {
  const vids = await db.video.findMany({ where: { translations: { some: { slug: { startsWith: RUN } } } }, select: { id: true, thumbnailMediaId: true } });
  await db.video.deleteMany({ where: { id: { in: vids.map((v) => v.id) } } });
  for (const m of [...createdMedia, ...vids.flatMap((v) => (v.thumbnailMediaId ? [v.thumbnailMediaId] : []))]) await deleteMedia(m).catch(() => undefined);
  await db.tag.deleteMany({ where: { id: tagId } });
});

describe("saving videos", () => {
  it("stores only the YouTube ID from a pasted link", async () => {
    const id = await create({ youtube: `https://www.youtube.com/watch?v=${ID}&t=30s` });
    const v = await getVideoForEdit(id);
    expect(v?.youtubeId).toBe(ID);
    expect(v?.status).toBe("DRAFT");
    expect(v?.translations.en).toBeNull();
  });

  it("validates the link, length, titles and slugs", async () => {
    const taken = `${RUN}-taken`;
    await create({ si: text("x", taken) });
    const cases: [Partial<VideoInput>, string][] = [
      [{ youtube: "https://vimeo.com/123" }, "youtube"],
      [{ duration: null }, "duration"],
      [{ duration: 3 * 86_400 }, "duration"],
      [{ si: blank, en: blank }, "form"],
      [{ si: { ...blank, slug: `${RUN}-noslugtitle` } }, "si.title"],
      [{ si: text("x", "Bad Slug") }, "si.slug"],
      [{ si: text("x", "page") }, "si.slug"],
      [{ si: text("x", taken) }, "si.slug"],
      [{ tagIds: ["missingtag"] }, "tags"],
      [{ categoryId: "missingcat" }, "categoryId"],
    ];
    for (const [over, field] of cases) {
      const r = await saveVideo(input(over), NOW);
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(r.errors[field], field).toBeTruthy();
    }
    // The same slug can be used once in each language.
    expect((await saveVideo(input({ si: blank, en: text("x", taken) }), NOW)).ok).toBe(true);
  });

  it("refuses a save based on an outdated copy", async () => {
    const id = await create();
    const stale = await edit(id);
    expect((await saveVideo({ ...(await edit(id)), si: { ...stale.si, title: "first tab" } }, NOW)).ok).toBe(true);
    expect((await saveVideo({ ...stale, si: { ...stale.si, title: "second tab" } }, NOW)).ok).toBe(false);
  });
});

describe("publishing and the public site", () => {
  it("is public only once published, and only in languages it has", async () => {
    const slug = `${RUN}-pub-${n++}`;
    const id = await create({ si: text("ප්‍රසිද්ධ වීඩියෝව", slug), tagIds: [tagId] });
    expect(await getVideoPage("si", slug)).toBeNull();
    const p = await saveVideo({ ...(await edit(id)), intent: "publish" }, NOW);
    expect(p.ok && p.status).toBe("PUBLISHED");
    const page = await getVideoPage("si", slug);
    expect(page?.youtubeId).toBe(ID);
    expect(page?.href).toBe(`/si/videos/${slug}`);
    expect(page?.tags.map((t) => t.name)).toEqual(["වීඩියෝ ටැගය"]);
    expect(page?.alternate).toBeNull();
    expect(await getVideoPage("en", slug)).toBeNull();
    expect((await getVideoList("si", 1)).videos.some((v) => v.id === id)).toBe(true);

    const u = await saveVideo({ ...(await edit(id)), intent: "unpublish" }, NOW);
    expect(u.ok && u.status).toBe("HIDDEN");
    expect(await getVideoPage("si", slug)).toBeNull();
  });

  it("schedules for the future only, and appears once the time passes", async () => {
    const id = await create();
    const past = await saveVideo({ ...(await edit(id)), intent: "schedule", scheduledAt: new Date(NOW.getTime() - MIN) }, NOW);
    expect(!past.ok && past.errors.scheduledAt).toBeTruthy();
    const ok = await saveVideo({ ...(await edit(id)), intent: "schedule", scheduledAt: new Date(NOW.getTime() + 10 * MIN) }, NOW);
    expect(ok.ok && ok.status).toBe("SCHEDULED");
    const slug = (await getVideoForEdit(id))!.translations.si!.slug;
    expect(await getVideoPage("si", slug)).toBeNull();
    // Pretend the time has come.
    await db.video.update({ where: { id }, data: { scheduledAt: new Date(Date.now() - MIN), publishedAt: new Date(Date.now() - MIN) } });
    expect((await getVideoPage("si", slug))?.id).toBe(id);
  });

  it("links both editions when both have a page", async () => {
    const slug = `${RUN}-both-${n++}`;
    const id = await create({ si: text("දෙභාෂා", slug), en: text("Both", slug), intent: "publish" });
    expect((await getVideoPage("si", slug))?.alternate).toEqual({ locale: "en", href: `/en/videos/${slug}` });
    expect((await getVideoPage("en", slug))?.alternate).toEqual({ locale: "si", href: `/si/videos/${slug}` });
    expect(await changeVideoState(id, "bin", NOW)).toBe(true);
    expect(await getVideoPage("si", slug)).toBeNull();
    expect((await listVideos({ deleted: true, q: "දෙභාෂා" })).items.some((v) => v.id === id)).toBe(true);
    expect(await changeVideoState(id, "restore", NOW)).toBe(true);
    expect((await getVideoPage("si", slug))?.id).toBe(id);
  });
});

describe("YouTube thumbnail import", () => {
  const jpeg = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 60 } } }).jpeg().toBuffer();

  it("stores YouTube's image like an upload, trying the smaller one when the large one is missing", async () => {
    const id = await create();
    const seen: string[] = [];
    const big = await jpeg(480, 360);
    const fake = (async (url: string | URL | Request) => {
      seen.push(String(url));
      if (String(url).includes("maxresdefault")) return new Response("not found", { status: 404 });
      return new Response(new Uint8Array(big), { headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch;
    expect(await importYouTubeThumbnail(id, fake)).toBe(true);
    expect(seen).toEqual([`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`]);
    const v = (await getVideoForEdit(id))!;
    expect(v.thumbnailMediaId).toBeTruthy();
    const media = await db.media.findUnique({ where: { id: v.thumbnailMediaId! }, include: { translations: true } });
    expect(media?.credit).toBe("YouTube");
    expect(media?.translations[0]?.altText).toBe("පරීක්ෂණ වීඩියෝව");
  });

  it("gives up cleanly when YouTube is unreachable or returns a placeholder or non-image", async () => {
    const id = await create();
    const tiny = await jpeg(120, 90);
    for (const fake of [
      (async () => { throw new Error("network down"); }) as unknown as typeof fetch,
      (async () => new Response(new Uint8Array(tiny), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch,
      (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch,
    ]) {
      expect(await importYouTubeThumbnail(id, fake)).toBe(false);
    }
    expect((await getVideoForEdit(id))?.thumbnailMediaId).toBeNull();
  });

  it("does nothing when an image is already chosen", async () => {
    const img = await db.media.create({ data: { storageKey: `${"a".repeat(24)}${n.toString().padStart(8, "0")}`, mimeType: "image/webp", width: 800, height: 450, sizeBytes: 1, checksum: `${RUN}-chk` } });
    createdMedia.push(img.id);
    const id = await create({ thumbnailMediaId: img.id });
    let called = false;
    const fake = (async () => { called = true; return new Response(""); }) as unknown as typeof fetch;
    expect(await importYouTubeThumbnail(id, fake)).toBe(true);
    expect(called).toBe(false);
  });
});

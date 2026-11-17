import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { db } from "@/server/db/client";
import { deleteMedia, getMediaItems, updateMediaText, uploadMedia, type MediaText } from "@/server/media/core";
import { processImage } from "@/server/media/process";
import { GET } from "@/app/media/[file]/route";

/** Uploads go to a temporary folder (see tests/setup.ts). */

const created: string[] = [];
const text: MediaText = { altSi: "පරීක්ෂණ රූපය", altEn: "Test image", captionSi: "", captionEn: "", credit: "Test" };

async function photo(width: number, height: number, opts: { format?: "jpeg" | "png" | "webp"; seed?: number; exif?: boolean; orientation?: number } = {}) {
  // Random noise so each test image has a distinct checksum.
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (opts.seed ?? Math.floor(Math.random() * 1e6))) % 251;
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  if (opts.exif) img = img.withExif({ IFD0: { Artist: "Secret Name", Copyright: "x" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 55/1 0/1" } });
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  const format = opts.format ?? "jpeg";
  return format === "png" ? img.png().toBuffer() : format === "webp" ? img.webp().toBuffer() : img.jpeg().toBuffer();
}

async function upload(buf: Buffer, t: MediaText = text) {
  const r = await uploadMedia(buf, t);
  if (r.ok) created.push(r.id);
  return r;
}

const fileOnDisk = (key: string, w: number) => join(process.env.MEDIA_DIR!, key.slice(0, 2), `${key}-${w}.webp`);

afterAll(async () => {
  await db.article.updateMany({ where: { featuredMediaId: { in: created } }, data: { featuredMediaId: null } });
  for (const id of created) await deleteMedia(id).catch(() => undefined);
});

describe("image processing", () => {
  it("re-encodes to WebP in three widths and strips EXIF, including GPS", async () => {
    const r = await processImage(await photo(2400, 1600, { exif: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.image.width).toBe(1600);
    expect(r.image.height).toBe(1067);
    for (const v of r.image.variants) {
      const meta = await sharp(v.data).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(v.width);
      expect(meta.exif).toBeUndefined();
      expect(v.data.includes(Buffer.from("Secret Name"))).toBe(false);
    }
  });

  it("does not enlarge small images", async () => {
    const r = await processImage(await photo(600, 400, { format: "png" }));
    expect(r.ok && r.image.width).toBe(600);
    if (r.ok) expect((await sharp(r.image.variants[2].data).metadata()).width).toBe(600);
  });

  it("applies the camera's rotation", async () => {
    const r = await processImage(await photo(800, 400, { orientation: 6 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.image.width, r.image.height]).toEqual([400, 800]);
  });

  it("rejects SVG, disguised files, tiny and oversized images", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>');
    expect(await processImage(svg)).toEqual({ ok: false, error: "unsupported" });
    expect(await processImage(Buffer.from("<html><body>not an image</body></html>".repeat(10)))).toEqual({ ok: false, error: "unsupported" });
    expect(await processImage(await photo(150, 190))).toEqual({ ok: false, error: "too_small" });
    expect(await processImage(await photo(400, 40))).toEqual({ ok: false, error: "too_small" });
    // A wide, short banner is fine.
    expect((await processImage(await photo(970, 90))).ok).toBe(true);
    expect(await processImage(Buffer.alloc(9 * 1024 * 1024))).toEqual({ ok: false, error: "too_large" });
    const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await processImage(gif)).toEqual({ ok: false, error: "unsupported" });
    const truncated = (await photo(800, 600)).subarray(0, 400);
    const t = await processImage(truncated);
    expect(t.ok).toBe(false);
  });
});

describe("media library", () => {
  it("stores files under a random name and records the image", async () => {
    const r = await upload(await photo(1200, 800, { format: "webp" }));
    expect(r.ok && !r.duplicate).toBe(true);
    if (!r.ok) return;
    const [m] = await getMediaItems([r.id]);
    expect(m.storageKey).toMatch(/^[a-f0-9]{32}$/);
    expect(m.altSi).toBe("පරීක්ෂණ රූපය");
    for (const w of [480, 960, 1600]) expect(existsSync(fileOnDisk(m.storageKey, w))).toBe(true);
  });

  it("requires a description in at least one language", async () => {
    const r = await uploadMedia(await photo(400, 400), { ...text, altSi: " ", altEn: "" });
    expect(r).toEqual({ ok: false, error: "no_alt" });
  });

  it("reuses the existing record when the same file is uploaded again", async () => {
    const buf = await photo(500, 500, { seed: 4242 });
    const a = await upload(buf);
    const b = await upload(buf);
    expect(a.ok && b.ok && a.id === b.id && b.duplicate).toBe(true);
  });

  it("updates descriptions per language", async () => {
    const r = await upload(await photo(400, 400));
    if (!r.ok) throw new Error("upload");
    expect((await updateMediaText(r.id, { ...text, altSi: "", altEn: "Only English", credit: "" })).ok).toBe(true);
    const [m] = await getMediaItems([r.id]);
    expect([m.altSi, m.altEn, m.credit]).toEqual(["", "Only English", null]);
    expect((await updateMediaText(r.id, { ...text, altSi: "", altEn: "" })).ok).toBe(false);
  });

  it("will not delete an image in use; deletes files when unused", async () => {
    const r = await upload(await photo(400, 400));
    if (!r.ok) throw new Error("upload");
    const [m] = await getMediaItems([r.id]);
    const category = await db.category.findFirst({ select: { id: true } });
    const article = await db.article.create({ data: { primaryCategoryId: category!.id, featuredMediaId: r.id }, select: { id: true } });
    expect((await deleteMedia(r.id)).ok).toBe(false);
    await db.article.delete({ where: { id: article.id } });
    expect((await deleteMedia(r.id)).ok).toBe(true);
    expect(existsSync(fileOnDisk(m.storageKey, 960))).toBe(false);
  });
});

describe("media route", () => {
  const get = (file: string) => GET(new Request(`http://localhost/media/${file}`), { params: Promise.resolve({ file }) });

  it("serves stored images with long caching and safe headers", async () => {
    const r = await upload(await photo(700, 500));
    if (!r.ok) throw new Error("upload");
    const [m] = await getMediaItems([r.id]);
    const res = await get(`${m.storageKey}-480.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(480);
  });

  it("returns 404 for unknown names and anything that is not a media file name", async () => {
    for (const f of ["0".repeat(32) + "-480.webp", "..%2F..%2Fetc%2Fpasswd", "../../.env", "a-480.webp", "0".repeat(32) + "-480.png"]) {
      expect((await get(f)).status, f).toBe(404);
    }
  });
});

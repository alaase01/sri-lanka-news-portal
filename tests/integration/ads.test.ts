import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Public queries use Next.js caching helpers, which only work inside Next.js.
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

import { db } from "@/server/db/client";
import { adState, deleteAd, listAds, moveAd, saveAd, setAdActive, type AdInput } from "@/server/admin/ads";
import { getRunningAds, recordAdEvents, statDay } from "@/server/services/ads";
import { deleteMedia } from "@/server/media/core";
import { GET as click } from "@/app/go/ad/[id]/route";
import { POST as view } from "@/app/api/ads/view/route";

/** Own-banner advertising. Banners use a run-specific advertiser name and are removed afterwards. */

const RUN = `t${Date.now().toString(36)}`;
const NOW = new Date();
const HOUR = 3_600_000;
let imageId = "";

function input(over: Partial<AdInput> = {}): AdInput {
  return {
    id: null,
    expectedUpdatedAt: null,
    placement: "IN_FEED",
    advertiser: `${RUN} Advertiser`,
    linkUrl: "https://example.com/offer",
    desktopMediaId: imageId,
    mobileMediaId: null,
    showSi: true,
    showEn: true,
    startsAt: new Date(NOW.getTime() - HOUR),
    endsAt: null,
    isActive: true,
    ...over,
  };
}

async function create(over: Partial<AdInput> = {}) {
  const r = await saveAd(input(over), NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

beforeAll(async () => {
  await db.advertisement.deleteMany({ where: { placement: "IN_FEED" } });
  imageId = (await db.media.create({ data: { storageKey: `ad${RUN}`.padEnd(32, "0").slice(0, 32), mimeType: "image/webp", width: 728, height: 90, sizeBytes: 1, checksum: `${RUN}-ad` } })).id;
});

afterAll(async () => {
  await db.advertisement.deleteMany({ where: { advertiser: { startsWith: RUN } } });
  await deleteMedia(imageId).catch(() => undefined);
});

describe("saving banners", () => {
  it("validates position, advertiser, link, images, editions and dates", async () => {
    const cases: [Partial<AdInput>, string][] = [
      [{ placement: "SIDEBAR" }, "placement"],
      [{ advertiser: "  " }, "advertiser"],
      [{ linkUrl: "example.com" }, "linkUrl"],
      [{ linkUrl: "javascript:alert(1)" }, "linkUrl"],
      [{ linkUrl: "ftp://example.com" }, "linkUrl"],
      [{ desktopMediaId: null, mobileMediaId: null }, "images"],
      [{ desktopMediaId: "nosuchimage" }, "images"],
      [{ showSi: false, showEn: false }, "editions"],
      [{ startsAt: null }, "startsAt"],
      [{ endsAt: new Date(NOW.getTime() - 2 * HOUR) }, "endsAt"],
    ];
    for (const [over, field] of cases) {
      const r = await saveAd(input(over), NOW);
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(r.errors[field], field).toBeTruthy();
    }
  });

  it("refuses a save based on an outdated copy", async () => {
    const id = await create();
    const ad = await db.advertisement.findUniqueOrThrow({ where: { id } });
    const stale = ad.updatedAt.toISOString();
    expect((await saveAd(input({ id, expectedUpdatedAt: stale, advertiser: `${RUN} first` }), NOW)).ok).toBe(true);
    expect((await saveAd(input({ id, expectedUpdatedAt: stale, advertiser: `${RUN} second` }), NOW)).ok).toBe(false);
  });

  it("works out the state from switch and dates", () => {
    const base = { isActive: true, startsAt: new Date(NOW.getTime() - HOUR), endsAt: null };
    expect(adState(base, NOW)).toBe("running");
    expect(adState({ ...base, isActive: false }, NOW)).toBe("off");
    expect(adState({ ...base, startsAt: new Date(NOW.getTime() + HOUR) }, NOW)).toBe("scheduled");
    expect(adState({ ...base, endsAt: new Date(NOW.getTime() - 1) }, NOW)).toBe("ended");
  });
});

describe("which banners run", () => {
  it("shows only running banners for the right edition, in the admin's order", async () => {
    await db.advertisement.deleteMany({ where: { placement: "IN_FEED" } });
    const a = await create({ advertiser: `${RUN} A` });
    const b = await create({ advertiser: `${RUN} B`, showEn: false });
    await create({ advertiser: `${RUN} later`, startsAt: new Date(Date.now() + HOUR) });
    await create({ advertiser: `${RUN} ended`, startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR / 2) }).catch(() => undefined);
    const off = await create({ advertiser: `${RUN} off` });
    await setAdActive(off, false);

    expect((await getRunningAds("si"))["in-feed"].map((x) => x.id)).toEqual([a, b]);
    expect((await getRunningAds("en"))["in-feed"].map((x) => x.id)).toEqual([a]);

    await moveAd(b, -1);
    expect((await getRunningAds("si"))["in-feed"].map((x) => x.id)).toEqual([b, a]);
    const states = (await listAds(new Date())).filter((x) => x.placement === "IN_FEED").map((x) => x.state).sort();
    expect(states).toContain("scheduled");
    expect(states).toContain("off");
  });
});

describe("counting", () => {
  it("counts views and clicks per Sri Lanka day, and ignores unknown banners", async () => {
    const id = await create({ advertiser: `${RUN} count` });
    expect(await recordAdEvents([id, id, "nosuchad"], "views", NOW)).toBe(1);
    await recordAdEvents([id], "views", NOW);
    await recordAdEvents([id], "clicks", NOW);
    const stat = await db.adStatDaily.findUniqueOrThrow({ where: { adId_day: { adId: id, day: statDay(NOW) } } });
    expect([stat.views, stat.clicks]).toEqual([2, 1]);
    const row = (await listAds(NOW)).find((x) => x.id === id)!;
    expect(row.views).toEqual({ total: 2, last30: 2 });
    expect(row.clicks).toEqual({ total: 1, last30: 1 });
  });

  it("uses the Sri Lanka date (UTC+5:30)", () => {
    expect(statDay(new Date("2026-11-16T18:29:00Z")).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(statDay(new Date("2026-11-16T18:31:00Z")).toISOString().slice(0, 10)).toBe("2026-11-17");
  });

  it("click route counts and redirects only to the saved address", async () => {
    const id = await create({ advertiser: `${RUN} click`, linkUrl: "https://shop.example.lk/sale?x=1" });
    const res = await click(new Request(`http://localhost/go/ad/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://shop.example.lk/sale?x=1");
    const stat = await db.adStatDaily.findFirstOrThrow({ where: { adId: id } });
    expect(stat.clicks).toBe(1);
    for (const bad of ["nosuchad", "../admin", "a b"]) {
      expect((await click(new Request("http://localhost/go/ad/x"), { params: Promise.resolve({ id: bad }) })).status).toBe(404);
    }
  });

  it("view route accepts small same-site lists only", async () => {
    const id = await create({ advertiser: `${RUN} view` });
    const post = (body: string, site = "same-origin") => view(new Request("http://localhost/api/ads/view", { method: "POST", body, headers: { "sec-fetch-site": site } }));
    expect((await post(JSON.stringify([id]))).status).toBe(204);
    expect((await post(JSON.stringify([id]), "cross-site")).status).toBe(403);
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify(["<script>"]))).status).toBe(400);
    expect((await post(JSON.stringify(Array(200).fill(id)))).status).toBe(413);
    expect((await db.adStatDaily.findFirstOrThrow({ where: { adId: id } })).views).toBe(1);
  });
});

describe("deleting", () => {
  it("removes the banner and its counts, but keeps the image; an image in use cannot be deleted", async () => {
    const id = await create({ advertiser: `${RUN} delete` });
    await recordAdEvents([id], "views", NOW);
    expect((await deleteMedia(imageId)).ok).toBe(false);
    expect(await deleteAd(id)).toBe(true);
    expect(await db.adStatDaily.count({ where: { adId: id } })).toBe(0);
    expect(await db.media.count({ where: { id: imageId } })).toBe(1);
  });
});

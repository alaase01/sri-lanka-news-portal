import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import type { Locale } from "@/lib/i18n/config";
import { PLACEMENT_TO_SLOT, type AdSlotName, type AdView } from "@/lib/content/ads";

/** Banners running now, per position, for one edition. Order: the admin's order. */
export async function getRunningAds(locale: Locale): Promise<Record<AdSlotName, AdView[]>> {
  "use cache";
  // Short, so a banner's start and end times take effect within a minute or two.
  cacheLife("minutes");
  cacheTag("ads");
  const now = new Date();
  const rows = await db.advertisement.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      ...(locale === "si" ? { showSi: true } : { showEn: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      desktopImage: { select: { storageKey: true, width: true, height: true } },
      mobileImage: { select: { storageKey: true, width: true, height: true } },
    },
  });
  const out: Record<AdSlotName, AdView[]> = { top: [], "home-mid": [], "in-article": [], "in-feed": [] };
  for (const r of rows) {
    if (!r.desktopImage && !r.mobileImage) continue;
    out[PLACEMENT_TO_SLOT[r.placement]].push({ id: r.id, advertiser: r.advertiser, desktop: r.desktopImage, mobile: r.mobileImage });
  }
  return out;
}

/** Today's date in Sri Lanka, as stored in AdStatDaily.day. */
export function statDay(now: Date): Date {
  return new Date(new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10));
}

/** Adds views or a click. Only counts banners that exist; never stores anything about the reader. */
export async function recordAdEvents(ids: string[], kind: "views" | "clicks", now: Date): Promise<number> {
  const unique = [...new Set(ids)].slice(0, 10);
  if (unique.length === 0) return 0;
  const existing = await db.advertisement.findMany({ where: { id: { in: unique } }, select: { id: true } });
  const day = statDay(now);
  for (const { id } of existing) {
    await db.adStatDaily.upsert({
      where: { adId_day: { adId: id, day } },
      create: { adId: id, day, [kind]: 1 },
      update: { [kind]: { increment: 1 } },
    });
  }
  return existing.length;
}

/** Where a banner click goes. */
export async function adTarget(id: string): Promise<string | null> {
  const ad = await db.advertisement.findUnique({ where: { id }, select: { linkUrl: true } });
  return ad?.linkUrl ?? null;
}

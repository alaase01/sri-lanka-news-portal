import "server-only";
import { db } from "@/server/db/client";
import type { AdPlacement } from "@/generated/prisma/client";
import { statDay } from "@/server/services/ads";
import type { FieldErrors } from "./articles";

/** Banner administration. Callers must have checked the admin session. */

export const AD_LIMITS = { advertiser: 120, url: 2000, perPlacement: 12 } as const;
const PLACEMENTS: AdPlacement[] = ["TOP", "HOME_MID", "IN_ARTICLE", "IN_FEED"];

export type AdState = "running" | "scheduled" | "ended" | "off";

export function adState(ad: { isActive: boolean; startsAt: Date; endsAt: Date | null }, now: Date): AdState {
  if (!ad.isActive) return "off";
  if (ad.endsAt && ad.endsAt <= now) return "ended";
  if (ad.startsAt > now) return "scheduled";
  return "running";
}

type Img = { id: string; storageKey: string; width: number; height: number } | null;
export type AdRow = {
  id: string;
  placement: AdPlacement;
  advertiser: string;
  linkUrl: string;
  showSi: boolean;
  showEn: boolean;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  state: AdState;
  desktop: Img;
  mobile: Img;
  views: { total: number; last30: number };
  clicks: { total: number; last30: number };
  updatedAt: Date;
};

const include = {
  desktopImage: { select: { id: true, storageKey: true, width: true, height: true } },
  mobileImage: { select: { id: true, storageKey: true, width: true, height: true } },
} as const;

export async function listAds(now: Date): Promise<AdRow[]> {
  const rows = await db.advertisement.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }], include });
  const ids = rows.map((r) => r.id);
  const since = new Date(statDay(now).getTime() - 29 * 86_400_000);
  const [all, recent] = await Promise.all([
    db.adStatDaily.groupBy({ by: ["adId"], where: { adId: { in: ids } }, _sum: { views: true, clicks: true } }),
    db.adStatDaily.groupBy({ by: ["adId"], where: { adId: { in: ids }, day: { gte: since } }, _sum: { views: true, clicks: true } }),
  ]);
  const a = new Map(all.map((x) => [x.adId, x._sum]));
  const r = new Map(recent.map((x) => [x.adId, x._sum]));
  return rows.map((ad) => ({
    id: ad.id,
    placement: ad.placement,
    advertiser: ad.advertiser,
    linkUrl: ad.linkUrl,
    showSi: ad.showSi,
    showEn: ad.showEn,
    startsAt: ad.startsAt,
    endsAt: ad.endsAt,
    isActive: ad.isActive,
    state: adState(ad, now),
    desktop: ad.desktopImage,
    mobile: ad.mobileImage,
    views: { total: a.get(ad.id)?.views ?? 0, last30: r.get(ad.id)?.views ?? 0 },
    clicks: { total: a.get(ad.id)?.clicks ?? 0, last30: r.get(ad.id)?.clicks ?? 0 },
    updatedAt: ad.updatedAt,
  }));
}

export async function getAd(id: string) {
  return db.advertisement.findUnique({ where: { id }, include });
}

export type AdInput = {
  id: string | null;
  expectedUpdatedAt: string | null;
  placement: string;
  advertiser: string;
  linkUrl: string;
  desktopMediaId: string | null;
  mobileMediaId: string | null;
  showSi: boolean;
  showEn: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

export async function saveAd(input: AdInput, now: Date): Promise<{ ok: true; id: string; updatedAt: string } | { ok: false; errors: FieldErrors; message: string }> {
  const current = input.id ? await db.advertisement.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !current) return { ok: false, errors: {}, message: "This banner no longer exists." };
  if (current && input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return { ok: false, errors: {}, message: "This banner was changed somewhere else after you opened it. Reload the page, then re-apply your changes." };
  }
  const errors: FieldErrors = {};
  const placement = PLACEMENTS.find((p) => p === input.placement);
  if (!placement) errors.placement = "Choose a position.";
  const advertiser = input.advertiser.trim();
  if (!advertiser) errors.advertiser = "Enter the advertiser's name. It is also the banner's description for screen readers.";
  else if (advertiser.length > AD_LIMITS.advertiser) errors.advertiser = `Keep it under ${AD_LIMITS.advertiser} characters.`;
  const linkUrl = input.linkUrl.trim();
  let parsed: URL | null = null;
  try {
    parsed = new URL(linkUrl);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:") || linkUrl.length > AD_LIMITS.url) {
    errors.linkUrl = "Enter the full web address the banner opens, starting with https://";
  }
  if (!input.desktopMediaId && !input.mobileMediaId) errors.images = "Choose or upload at least one banner image.";
  const imageIds = [input.desktopMediaId, input.mobileMediaId].filter((x): x is string => !!x);
  if (imageIds.length && (await db.media.count({ where: { id: { in: imageIds } } })) !== new Set(imageIds).size) errors.images = "A selected image no longer exists.";
  if (!input.showSi && !input.showEn) errors.editions = "Show it on at least one edition.";
  if (!input.startsAt) errors.startsAt = "Choose when the banner starts.";
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) errors.endsAt = "The end must be after the start.";
  if (!current && input.endsAt && input.endsAt <= now) errors.endsAt = "The end time has already passed.";
  if (placement && !current && (await db.advertisement.count({ where: { placement } })) >= AD_LIMITS.perPlacement) {
    errors.placement = `This position already has ${AD_LIMITS.perPlacement} banners. Delete ended ones first.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors, message: "Nothing was saved. Fix the highlighted fields." };

  const data = {
    placement: placement!,
    advertiser,
    linkUrl,
    desktopMediaId: input.desktopMediaId,
    mobileMediaId: input.mobileMediaId,
    showSi: input.showSi,
    showEn: input.showEn,
    startsAt: input.startsAt!,
    endsAt: input.endsAt,
    isActive: input.isActive,
  };
  if (current) {
    const moved = current.placement !== placement;
    const last = moved ? await db.advertisement.findFirst({ where: { placement }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }) : null;
    const saved = await db.advertisement.update({ where: { id: current.id }, data: { ...data, ...(moved ? { sortOrder: (last?.sortOrder ?? -1) + 1 } : {}) } });
    return { ok: true, id: saved.id, updatedAt: saved.updatedAt.toISOString() };
  }
  const last = await db.advertisement.findFirst({ where: { placement }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const saved = await db.advertisement.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return { ok: true, id: saved.id, updatedAt: saved.updatedAt.toISOString() };
}

export async function setAdActive(id: string, isActive: boolean): Promise<boolean> {
  return (await db.advertisement.updateMany({ where: { id }, data: { isActive } })).count === 1;
}

/** Moves a banner up or down within its position (the order banners take turns in). */
export async function moveAd(id: string, direction: -1 | 1): Promise<boolean> {
  const ad = await db.advertisement.findUnique({ where: { id } });
  if (!ad) return false;
  const rows = await db.advertisement.findMany({ where: { placement: ad.placement }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = rows.findIndex((r) => r.id === id);
  const j = i + direction;
  if (j < 0 || j >= rows.length) return true;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await db.$transaction(rows.map((r, k) => db.advertisement.update({ where: { id: r.id }, data: { sortOrder: k } })));
  return true;
}

/** Deletes a banner and its counts. The images stay in the media library. */
export async function deleteAd(id: string): Promise<boolean> {
  return (await db.advertisement.deleteMany({ where: { id } })).count === 1;
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listAds, type AdRow } from "@/server/admin/ads";
import { adListAction } from "@/server/admin/ad-actions";
import { AD_ROTATE_SECONDS, AD_SLOTS } from "@/lib/content/ads";
import { mediaUrl } from "@/lib/content/media";
import { formatDateTime } from "@/lib/utils/dates";
import { Notice, PageHeader, buttonPrimary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Advertisements" };
export const instant = false;

const STATE: Record<AdRow["state"], [string, string]> = {
  running: ["Running", "bg-[#e1f4e8] text-[#14532d]"],
  scheduled: ["Starts later", "bg-[#e3ecff] text-[#1d3d8f]"],
  ended: ["Ended", "bg-soft text-muted"],
  off: ["Switched off", "bg-[#fdecee] text-brand-dark"],
};

const DONE: Record<string, string> = { created: "Banner created.", on: "Banner switched on.", off: "Banner switched off.", up: "Order changed.", down: "Order changed.", delete: "Banner deleted." };

function requestTime(): Date {
  return new Date();
}

/** True when the image's shape is noticeably different from the position's. */
function shapeOff(img: { width: number; height: number } | null, size: { w: number; h: number }) {
  if (!img) return false;
  return Math.abs(img.width / img.height - size.w / size.h) / (size.w / size.h) > 0.15;
}

export default async function AdsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const ads = await listAds(requestTime());
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  const pct = (c: number, v: number) => (v > 0 ? ` (${((c / v) * 100).toFixed(1)}%)` : "");

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Advertisements">
        <Link href="/admin/ads/new" className={buttonPrimary + " inline-flex items-center"}>New banner</Link>
      </PageHeader>
      <p className="text-body">
        Your own banners in the four ad positions. Several running banners in one position take turns every {AD_ROTATE_SECONDS} seconds.
        A view counts when at least half the banner has been on screen for a second.
      </p>
      {done && <Notice>{done}</Notice>}

      {Object.values(AD_SLOTS).map((slot) => {
        const rows = ads.filter((a) => a.placement === slot.placement);
        const running = rows.filter((a) => a.state === "running").length;
        return (
          <section key={slot.placement} className="rounded-lg bg-white p-5" aria-labelledby={`h-${slot.placement}`}>
            <h2 id={`h-${slot.placement}`} className="text-lg font-bold">{slot.label}</h2>
            <p className="text-sm text-muted">
              {slot.where} · {slot.desktop.w}×{slot.desktop.h} on computers, {slot.mobile.w}×{slot.mobile.h} on phones · {running} running
              {running > 1 ? `, each shown about 1 in ${running}` : ""}
            </p>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No banners. This position shows nothing on the site.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {rows.map((ad, i) => {
                  const [stateLabel, stateClass] = STATE[ad.state];
                  const img = ad.desktop ?? ad.mobile;
                  const warn = shapeOff(ad.desktop, slot.desktop) || shapeOff(ad.mobile, slot.mobile);
                  return (
                    <li key={ad.id} className="flex flex-wrap items-center gap-4 py-3">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP
                        <img src={mediaUrl(img.storageKey, 480)} alt="" className="h-14 w-40 rounded bg-soft object-contain" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/ads/${ad.id}`} className="font-sans font-semibold text-navy hover:underline">{ad.advertiser}</Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className={`rounded px-2 py-0.5 font-semibold ${stateClass}`}>{stateLabel}</span>
                          <span>{[ad.showSi && "Sinhala", ad.showEn && "English"].filter(Boolean).join(" + ")}</span>
                          <span>· {formatDateTime(ad.startsAt.toISOString(), "en")} → {ad.endsAt ? formatDateTime(ad.endsAt.toISOString(), "en") : "no end"}</span>
                        </p>
                        <p className="mt-0.5 text-xs">
                          Last 30 days: {ad.views.last30.toLocaleString("en-US")} views, {ad.clicks.last30.toLocaleString("en-US")} clicks{pct(ad.clicks.last30, ad.views.last30)} · All time: {ad.views.total.toLocaleString("en-US")} / {ad.clicks.total.toLocaleString("en-US")}
                        </p>
                        {warn && <p className="mt-0.5 text-xs font-semibold text-notice-ink">The image&rsquo;s shape does not match this position, so it shows with empty bands.</p>}
                      </div>
                      <form action={adListAction} className="flex gap-1">
                        <input type="hidden" name="adId" value={ad.id} />
                        {i > 0 && <button type="submit" name="op" value="up" aria-label="Move up" className="min-h-9 min-w-9 rounded border border-line text-sm font-semibold hover:bg-soft">↑</button>}
                        {i < rows.length - 1 && <button type="submit" name="op" value="down" aria-label="Move down" className="min-h-9 min-w-9 rounded border border-line text-sm font-semibold hover:bg-soft">↓</button>}
                        <button type="submit" name="op" value={ad.isActive ? "off" : "on"} className="min-h-9 rounded border border-line px-2 text-sm font-semibold hover:bg-soft">{ad.isActive ? "Switch off" : "Switch on"}</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

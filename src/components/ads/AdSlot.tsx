import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { AD_SLOTS, type AdSlotName } from "@/lib/content/ads";
import { getRunningAds } from "@/server/services/ads";
import { AdRotator } from "./AdRotator";

export type { AdSlotName } from "@/lib/content/ads";

/**
 * An advertising position. Shows the banners booked for it (managed in
 * /admin/ads), taking turns. With none booked it shows nothing on the live
 * site; in development it draws a labelled placeholder at its real size.
 * The box keeps fixed dimensions so the page never shifts.
 */
export async function AdSlot({ slot, label, locale }: { slot: AdSlotName; label: string; locale: Locale }) {
  const { box, desktop, mobile, desktopFrom } = AD_SLOTS[slot];
  const ads = (await getRunningAds(locale))[slot];
  if (ads.length === 0) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <aside aria-label={label} className="flex flex-col items-center gap-1">
        <span className="text-[11px] text-muted">{label}</span>
        <div className={`flex max-w-full items-center justify-center rounded border border-dashed border-muted bg-soft font-latin text-sm text-muted ${box}`}>
          {slot} · {mobile.w}×{mobile.h} / {desktop.w}×{desktop.h}
        </div>
      </aside>
    );
  }
  const t = getDictionary(locale);
  return (
    <aside aria-label={label} className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <AdRotator ads={ads} box={box} desktopFrom={desktopFrom} labels={{ pause: t.pauseAds, play: t.playAds }} />
    </aside>
  );
}

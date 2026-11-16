/**
 * A reserved advertising position.
 *
 * The four positions and their sizes are fixed here so the layout is designed
 * around them. Until ad management exists there is nothing to show, so in
 * production a slot renders nothing; in development it draws a labelled
 * placeholder at its real size so the positions can be reviewed.
 *
 * When ads are wired in, the box must keep these exact dimensions so the page
 * does not shift as an ad loads.
 */

export type AdSlotName = "top" | "home-mid" | "in-article" | "in-feed";

const SLOTS: Record<AdSlotName, { box: string; sizes: string }> = {
  // Under the header on every page.
  top: { box: "h-[100px] w-[320px] lg:h-[90px] lg:w-[970px]", sizes: "320×100 / 970×90" },
  // Homepage, between Top Stories and the category sections.
  "home-mid": { box: "h-[250px] w-[300px] lg:w-[970px]", sizes: "300×250 / 970×250" },
  // Inside an article, after the third paragraph.
  "in-article": { box: "h-[250px] w-[300px]", sizes: "300×250" },
  // Category and tag listings, after the eighth story.
  "in-feed": { box: "h-[250px] w-[300px] md:h-[90px] md:w-[728px]", sizes: "300×250 / 728×90" },
};

export function AdSlot({ slot, label }: { slot: AdSlotName; label: string }) {
  if (process.env.NODE_ENV === "production") return null;
  const { box, sizes } = SLOTS[slot];
  return (
    <aside aria-label={label} className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <div
        className={`flex max-w-full items-center justify-center rounded border border-dashed border-muted bg-soft font-latin text-sm text-muted ${box}`}
      >
        {slot} · {sizes}
      </div>
    </aside>
  );
}

/**
 * The four advertising positions. Sizes are fixed so the page never shifts
 * when a banner loads or changes. Safe to import from client components.
 */

export type AdSlotName = "top" | "home-mid" | "in-article" | "in-feed";
export type AdPlacementKey = "TOP" | "HOME_MID" | "IN_ARTICLE" | "IN_FEED";

export const AD_ROTATE_SECONDS = 10;

export const AD_SLOTS: Record<
  AdSlotName,
  { placement: AdPlacementKey; label: string; where: string; desktop: { w: number; h: number }; mobile: { w: number; h: number }; box: string; desktopFrom: string }
> = {
  top: {
    placement: "TOP",
    label: "Top banner",
    where: "Under the header on every page",
    desktop: { w: 970, h: 90 },
    mobile: { w: 320, h: 100 },
    box: "h-[100px] w-[320px] lg:h-[90px] lg:w-[970px]",
    desktopFrom: "(min-width: 1024px)",
  },
  "home-mid": {
    placement: "HOME_MID",
    label: "Homepage middle",
    where: "Homepage, between Top Stories and the category blocks",
    desktop: { w: 970, h: 250 },
    mobile: { w: 300, h: 250 },
    box: "h-[250px] w-[300px] lg:w-[970px]",
    desktopFrom: "(min-width: 1024px)",
  },
  "in-article": {
    placement: "IN_ARTICLE",
    label: "Inside articles",
    where: "Inside every article, after the third paragraph",
    desktop: { w: 300, h: 250 },
    mobile: { w: 300, h: 250 },
    box: "h-[250px] w-[300px]",
    desktopFrom: "(min-width: 1024px)",
  },
  "in-feed": {
    placement: "IN_FEED",
    label: "In story lists",
    where: "Category and tag pages, after the eighth story",
    desktop: { w: 728, h: 90 },
    mobile: { w: 300, h: 250 },
    box: "h-[250px] w-[300px] md:h-[90px] md:w-[728px]",
    desktopFrom: "(min-width: 768px)",
  },
};

export const PLACEMENT_TO_SLOT: Record<AdPlacementKey, AdSlotName> = { TOP: "top", HOME_MID: "home-mid", IN_ARTICLE: "in-article", IN_FEED: "in-feed" };

/** A running banner as the public page needs it. */
export type AdView = {
  id: string;
  advertiser: string;
  desktop: { storageKey: string; width: number; height: number } | null;
  mobile: { storageKey: string; width: number; height: number } | null;
};

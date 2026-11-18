/**
 * Image URLs. Every upload is stored as WebP in three widths; the browser
 * picks one with srcset. Safe to import from client components.
 */

export const MEDIA_WIDTHS = [480, 960, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];
export const MEDIA_FILE_PATTERN = /^([a-f0-9]{32})-(480|960|1600)\.webp$/;

/** Share images (Facebook, WhatsApp, X): 1200 × 630 JPEG, made once from the 1600 px version on first request. */
export const SHARE_IMAGE = { width: 1200, height: 630, type: "image/jpeg" } as const;
export const SHARE_FILE_PATTERN = /^([a-f0-9]{32})-og\.jpg$/;
/** Images narrower than this make a poor share image; the default image is used instead. */
export const SHARE_MIN_SOURCE_WIDTH = 600;

export function shareImageUrl(storageKey: string): string {
  return `/media/${storageKey}-og.jpg`;
}

export function mediaUrl(storageKey: string, width: MediaWidth): string {
  return `/media/${storageKey}-${width}.webp`;
}

/** srcset for an image whose largest stored version is `width` pixels wide. */
export function mediaSrcSet(storageKey: string, width: number): string {
  const seen = new Set<number>();
  const parts: string[] = [];
  for (const w of MEDIA_WIDTHS) {
    const actual = Math.min(w, width);
    if (seen.has(actual)) continue;
    seen.add(actual);
    parts.push(`${mediaUrl(storageKey, w)} ${actual}w`);
  }
  return parts.join(", ");
}

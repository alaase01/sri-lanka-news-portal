/**
 * Image URLs. Every upload is stored as WebP in three widths; the browser
 * picks one with srcset. Safe to import from client components.
 */

export const MEDIA_WIDTHS = [480, 960, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];
export const MEDIA_FILE_PATTERN = /^([a-f0-9]{32})-(480|960|1600)\.webp$/;

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

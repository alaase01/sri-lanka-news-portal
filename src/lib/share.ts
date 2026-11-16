export type ShareTarget = "whatsapp" | "facebook" | "x" | "telegram";

/**
 * Share links for an article. `url` must be the absolute, canonical,
 * language-specific address of a published article; the caller is responsible
 * for only building these on pages that are publicly reachable.
 */
export function buildShareLinks(url: string, title: string): Record<ShareTarget, string> {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  };
}

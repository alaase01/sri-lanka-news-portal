/**
 * URL slugs. Both editions use lowercase Latin letters, digits and hyphens,
 * so links survive copying into messaging apps and old browsers. A Sinhala
 * article gets a Latin slug (usually the English headline or a short
 * transliteration typed by the editor).
 */

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
export const SLUG_MAX = 120;

/**
 * First path segments the site uses for its own pages. A top-level category
 * may not take one of these, and no slug may be "page" (used for pagination).
 */
export const RESERVED_SLUGS = new Set([
  "page",
  "tag",
  "public-opinions",
  "developer",
  "videos",
  "search",
  "admin",
  "api",
  "media",
  // Static pages (Admin → Static Pages)
  "about",
  "contact",
  "privacy-policy",
  "terms-and-conditions",
  "editorial-policy",
]);

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !value.includes("--");
}

/** Suggests a slug from Latin text. Non-Latin characters are dropped, so Sinhala text gives "". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

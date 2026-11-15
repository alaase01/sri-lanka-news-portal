import "server-only";
import type { Metadata } from "next";
import { env } from "@/config/env";
import { otherLocale, type Locale } from "@/lib/i18n/config";

export const SITE_NAME = "RSnewslk.com";

export function absoluteUrl(path: string): string {
  return `${env.SITE_URL}${path}`;
}

/**
 * Canonical URL for a page, plus hreflang alternates when the same page exists in
 * the other edition. With no counterpart, no alternates are emitted.
 */
export function alternates(locale: Locale, path: string, otherPath: string | null): Metadata["alternates"] {
  const canonical = absoluteUrl(path);
  if (!otherPath) return { canonical };
  const other = otherLocale(locale);
  const sinhala = locale === "si" ? canonical : absoluteUrl(otherPath);
  return {
    canonical,
    languages: {
      [locale]: canonical,
      [other]: absoluteUrl(otherPath),
      "x-default": sinhala,
    },
  };
}

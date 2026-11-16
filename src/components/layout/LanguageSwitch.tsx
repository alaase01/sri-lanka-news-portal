"use client";

import type { MouseEvent } from "react";
import { otherLocale, type Locale } from "@/lib/i18n/config";

/**
 * Links to the other edition. On a page that has a published translation
 * (announced through <link rel="alternate" hreflang>), it goes straight to that
 * translation; otherwise to the other edition's homepage.
 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  const other = otherLocale(locale);

  const goToTranslation = (event: MouseEvent<HTMLAnchorElement>) => {
    const link = document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${other}"]`);
    if (!link?.href) return; // fall through to the plain link
    const url = new URL(link.href);
    if (url.pathname.startsWith(`/${other}`)) {
      event.preventDefault();
      window.location.assign(url.pathname);
    }
  };

  const active = "bg-white px-3 py-1 font-semibold text-navy";
  const inactive = "px-3 py-1 text-white hover:bg-navy-line";
  const props = (target: Locale) =>
    target === locale
      ? { href: `/${target}`, "aria-current": "true" as const, className: active }
      : { href: `/${target}`, onClick: goToTranslation, className: inactive };

  // Plain <a>: the two editions have separate root layouts, so this is a full page load.
  return (
    <div className="flex overflow-hidden rounded border border-navy-line text-sm">
      {/* Always the Sinhala font, including on the English edition where the page font is Latin. */}
      <span className="font-sans">
        <a lang="si" {...props("si")} style={{ display: "block" }}>
          සිංහල
        </a>
      </span>
      <span className="font-latin">
        <a lang="en" {...props("en")} style={{ display: "block" }}>
          English
        </a>
      </span>
    </div>
  );
}

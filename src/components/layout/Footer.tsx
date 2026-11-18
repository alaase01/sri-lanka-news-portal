import Link from "next/link";
import { developer } from "@/config/developer";
import type { Locale } from "@/lib/i18n/config";
import { Wordmark } from "./Wordmark";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { SiteChrome } from "@/server/services/content";

export function Footer({ locale, t, chrome }: { locale: Locale; t: Dictionary; chrome: SiteChrome }) {
  // Static pages (Admin → Static Pages). Only pages published in this language are listed.
  const label: Record<string, string> = { about: t.about, contact: t.contact, privacy: t.privacy, terms: t.terms, editorial: t.editorialPolicy };
  const pages = chrome.pages.filter((p) => label[p.key]);
  return (
    <footer className="on-dark mt-10 bg-navy text-navy-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-4 px-4 py-7 text-sm lg:px-6">
        <Wordmark className="text-[22px]" />
        {pages.length > 0 && (
          <nav aria-label={t.footerPages}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-white">
              {pages.map((p) => (
                <li key={p.key}>
                  <Link href={p.href} className="underline-offset-2 hover:underline">
                    {label[p.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {chrome.social.length > 0 && (
          <ul aria-label={t.followUs} className="flex flex-wrap gap-x-5 gap-y-2 font-latin text-sm">
            {chrome.social.map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="me noopener" target="_blank" className="underline-offset-2 hover:underline">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p>
          © 2026 {chrome.siteName}. {t.rights}
        </p>
      </div>
      {/* Developer credit: deliberately small and set apart from the publication's own footer. */}
      <div className="border-t border-navy-line">
        <p className="mx-auto max-w-7xl px-4 py-3 text-xs text-[#9fb0c8] lg:px-6">
          {t.websiteBy}{" "}
          {developer.footerLinksToPage ? (
            <Link href={`/${locale}/developer`} className="underline-offset-2 hover:text-white hover:underline">
              {developer.footerCredit}
            </Link>
          ) : (
            <span>{developer.footerCredit}</span>
          )}
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { developer } from "@/config/developer";
import type { Locale } from "@/lib/i18n/config";
import { Wordmark } from "./Wordmark";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { SiteChrome } from "@/server/services/content";

export function Footer({ locale, t, chrome }: { locale: Locale; t: Dictionary; chrome: SiteChrome }) {
  // Static pages (About, Contact, policies) are added with the admin portal; shown as plain text until then.
  const pages = [t.about, t.contact, t.privacy, t.terms, t.editorialPolicy];
  return (
    <footer className="on-dark mt-10 bg-navy text-navy-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-4 px-4 py-7 text-sm lg:px-6">
        <Wordmark className="text-[22px]" />
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-white">
          {pages.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
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

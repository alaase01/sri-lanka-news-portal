import type { Dictionary } from "@/lib/i18n/dictionary";
import type { SiteChrome } from "@/server/services/content";

export function Footer({ t, chrome }: { t: Dictionary; chrome: SiteChrome }) {
  // Static pages (About, Contact, policies) are added with the admin portal; shown as plain text until then.
  const pages = [t.about, t.contact, t.privacy, t.terms, t.editorialPolicy];
  return (
    <footer className="on-dark mt-10 bg-navy text-navy-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-4 px-4 py-7 text-sm lg:px-6">
        <span className="font-latin text-[22px] font-extrabold italic text-white">
          RSNEWS<span className="text-brand-light">LK</span>.COM
        </span>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-white">
          {pages.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>
          © 2026 {chrome.siteName}. {t.rights}
        </p>
      </div>
    </footer>
  );
}

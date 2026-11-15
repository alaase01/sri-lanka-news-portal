import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { SiteChrome } from "@/server/services/content";
import { LanguageSwitch } from "./LanguageSwitch";
import { MobileMenu } from "./MobileMenu";
import { NavLinks, NavLinksFallback } from "./NavLinks";
import { TodayDate } from "./TodayDate";

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-latin font-extrabold italic tracking-tight text-white ${className ?? ""}`}>
      RSNEWS<span className="text-brand-light">LK</span>.COM
    </span>
  );
}

export function Header({ locale, t, chrome }: { locale: Locale; t: Dictionary; chrome: SiteChrome }) {
  const home = `/${locale}`;
  return (
    <header className="on-dark bg-navy text-white">
      {chrome.notice && (
        <p className="bg-notice px-4 py-1.5 text-center text-[13px] text-notice-ink">{chrome.notice}</p>
      )}

      {/* Utility bar: desktop only, so the phone header stays compact. */}
      <div className="hidden bg-navy-deep lg:block">
        <div className="mx-auto flex min-h-10 max-w-7xl items-center justify-between gap-6 px-6 text-[13px]">
          <p className="flex gap-5 text-navy-soft">
            <TodayDate locale={locale} />
            <span>{t.city}</span>
          </p>
          <div className="flex items-center gap-5">
            <LanguageSwitch locale={locale} />
            {chrome.social.length > 0 && (
              <ul className="flex gap-4 font-latin">
                {chrome.social.map((s) => (
                  <li key={s.name}>
                    <a href={s.url} rel="noopener noreferrer" className="text-navy-soft hover:text-white">
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Masthead: full on desktop. */}
      <div className="mx-auto hidden max-w-7xl flex-wrap items-center gap-x-10 gap-y-3 px-6 py-5 lg:flex">
        <Link href={home} aria-label={`${chrome.siteName} — ${t.home}`} className="flex flex-col gap-0.5">
          <Wordmark className="text-[40px] leading-none" />
          <span className="font-latin text-[11px] tracking-[4px] text-navy-soft">INDEPENDENT DIGITAL NEWS MEDIA</span>
        </Link>
        {chrome.tagline && (
          <p className="max-w-md border-l-2 border-navy-line pl-6 text-[17px] font-medium leading-relaxed">
            {chrome.tagline}
          </p>
        )}
      </div>

      {/* Navigation bar. On phones this is the whole header and it sticks to the top. */}
      <div className="relative border-navy-line lg:border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 lg:px-6">
          <Link href={home} aria-label={`${chrome.siteName} — ${t.home}`} className="flex h-14 items-center lg:hidden">
            <Wordmark className="text-[19px] sm:text-[22px]" />
          </Link>
          <nav aria-label={t.mainMenu} className="hidden lg:block">
            {/* The current path is only known per URL, so it resolves inside a boundary. */}
            <Suspense fallback={<NavLinksFallback items={chrome.nav} homeHref={home} homeLabel={t.home} />}>
              <NavLinks items={chrome.nav} homeHref={home} homeLabel={t.home} />
            </Suspense>
          </nav>
          <div className="flex items-center gap-1">
            <div className="lg:hidden">
              <LanguageSwitch locale={locale} />
            </div>
            <MobileMenu
              items={chrome.nav}
              homeHref={home}
              labels={{ home: t.home, menu: t.menu, close: t.closeMenu, mainMenu: t.mainMenu }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

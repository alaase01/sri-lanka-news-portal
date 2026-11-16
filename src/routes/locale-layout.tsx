import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/noto-sans-sinhala";
import "@/app/globals.css";
import { env } from "@/config/env";
import { languageTag, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { SITE_NAME } from "@/lib/seo/metadata";
import { getSiteChrome } from "@/server/services/content";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

export const viewport: Viewport = { themeColor: "#0b1f3a", width: "device-width", initialScale: 1 };

export function layoutMetadata(locale: Locale): Metadata {
  return {
    metadataBase: new URL(env.SITE_URL),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description:
      locale === "si"
        ? "ශ්‍රී ලංකාවේ සහ ලෝකයේ නවතම පුවත් සිංහලෙන්."
        : "The latest news from Sri Lanka and the world.",
    openGraph: { siteName: SITE_NAME, locale: locale === "si" ? "si_LK" : "en_LK", type: "website" },
  };
}

export async function LocaleLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = getDictionary(locale);
  const stored = await getSiteChrome(locale);
  // Public Opinions is a fixed part of the site, not a category, so it is added
  // here rather than stored as a navigation row.
  const chrome = {
    ...stored,
    nav: [...stored.nav, { id: "public-opinions", label: t.publicOpinions, href: `/${locale}/public-opinions`, children: [] }],
  };
  return (
    <html lang={languageTag[locale]}>
      {/* The Sinhala font's Latin letters are widely spaced, so the English edition uses the Latin stack. */}
      <body className={`flex min-h-screen flex-col antialiased ${locale === "en" ? "font-latin" : ""}`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-navy"
        >
          {t.skipToContent}
        </a>
        <div className="sticky top-0 z-30 lg:static">
          <Header locale={locale} t={t} chrome={chrome} />
        </div>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 lg:px-6">
          {children}
        </main>
        <Footer locale={locale} t={t} chrome={chrome} />
      </body>
    </html>
  );
}

export const locales = ["si", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "si";

export function otherLocale(locale: Locale): Locale {
  return locale === "si" ? "en" : "si";
}

/** BCP 47 tags used for <html lang> and hreflang. */
export const languageTag: Record<Locale, string> = { si: "si", en: "en" };

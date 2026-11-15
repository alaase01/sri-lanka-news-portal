import type { Locale } from "./config";
import si from "./si.json";
import en from "./en.json";

export type Dictionary = typeof si;

const dictionaries: Record<Locale, Dictionary> = { si, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

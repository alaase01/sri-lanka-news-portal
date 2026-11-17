import type { Locale } from "@/lib/i18n/config";

/** AI Editorial Assistant operations and styles. Shared by the admin page and the server. */

export const OPERATIONS = ["rewrite", "grammar", "translate_si_en", "translate_en_si", "headline_improve", "headline_alternatives"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_LABEL: Record<Operation, string> = {
  rewrite: "Rewrite the article",
  grammar: "Improve grammar and readability",
  translate_si_en: "Translate Sinhala → English",
  translate_en_si: "Translate English → Sinhala",
  headline_improve: "Improve the headline",
  headline_alternatives: "Suggest alternative headlines",
};

export const STYLES = ["professional", "formal", "concise", "neutral", "simple"] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABEL: Record<Style, string> = {
  professional: "Professional news reporting",
  formal: "Formal journalistic",
  concise: "Concise news",
  neutral: "Neutral and factual",
  simple: "Easy to understand",
};

/** What the operation needs and produces. */
export function operationInfo(op: Operation, sourceLocale: Locale): { outputLocale: Locale; needsBody: boolean; headlinesOnly: boolean; light: boolean } {
  switch (op) {
    case "translate_si_en":
      return { outputLocale: "en", needsBody: true, headlinesOnly: false, light: false };
    case "translate_en_si":
      return { outputLocale: "si", needsBody: true, headlinesOnly: false, light: false };
    case "headline_improve":
    case "headline_alternatives":
      return { outputLocale: sourceLocale, needsBody: false, headlinesOnly: true, light: true };
    default:
      return { outputLocale: sourceLocale, needsBody: true, headlinesOnly: false, light: false };
  }
}

/** The source language an operation requires, if any. */
export function requiredSourceLocale(op: Operation): Locale | null {
  return op === "translate_si_en" ? "si" : op === "translate_en_si" ? "en" : null;
}


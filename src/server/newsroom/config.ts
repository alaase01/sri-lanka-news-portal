import "server-only";

/**
 * Sources the newsroom may search and read. Reputable international outlets with
 * their own reporting, plus official and scientific bodies for primary
 * information. Search and fetch are restricted to these domains (and their
 * subdomains) by the API itself. Adjust the list here; keep it to sources whose
 * terms allow reading by automated tools, and never add paywall workarounds.
 * Sites that block Anthropic's crawler are refused by the API; the pipeline then
 * skips them automatically (see blockedDomainsIn) and tells the admin.
 */
export const TRUSTED_DOMAINS = [
  // International news organisations whose sites allow Anthropic's crawler.
  // Not listed because they block it (checked 2026-11-19): reuters.com, apnews.com,
  // bbc.com, bbc.co.uk, dw.com, theguardian.com, nhk.or.jp.
  "aljazeera.com",
  "france24.com",
  "npr.org",
  "abc.net.au",
  "cbc.ca",
  "channelnewsasia.com",
  "euronews.com",
  "thehindu.com",
  // International organisations and official sources
  "un.org",
  "who.int",
  "imf.org",
  "worldbank.org",
  "wmo.int",
  "reliefweb.int",
  "europa.eu",
  "gov.uk",
  "nasa.gov",
  "esa.int",
  // Science
  "nature.com",
  "science.org",
] as const;

export const NEWSROOM_LIMITS = {
  /** Candidate stories asked for in discovery. */
  candidates: 6,
  discoverySearches: 4,
  factSearches: 2,
  factFetches: 4,
  /** Approximate tokens of page text kept per fetch. */
  fetchTokens: 6_000,
  maxWords: 400,
  /** Minimum confirmed or official facts for a story. */
  minFacts: 3,
  /** Hard ceiling on stories per run, whatever the setting. */
  maxStoriesCeiling: 5,
  /** A run that holds the lock longer than this is treated as crashed. */
  lockMinutes: 45,
} as const;

/** Thresholds of the code-based copyright screen (draft vs. sources read during research). */
export const SIMILARITY = {
  highRun: 25,
  mediumRun: 12,
  highShingles: 0.15,
  mediumShingles: 0.05,
  headlineJaccard: 0.7,
  maxQuotedWords: 60,
} as const;

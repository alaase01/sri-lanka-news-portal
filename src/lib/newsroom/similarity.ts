/**
 * Code checks used by the newsroom's copyright screen. They compare a draft with
 * the source pages that were read during research (held in memory only).
 * These checks reduce risk; they do not establish legal compliance.
 */

/** Lower-case words, punctuation removed (works for English and Sinhala letters). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** Removes quoted passages, which are checked separately as quotations. */
export function withoutQuotes(text: string): string {
  return text.replace(/["“][^"”]{0,600}["”]/g, " ");
}

/** Length (in words) of the longest run of words the draft shares with the source. */
export function longestSharedRun(draft: string, source: string): number {
  const a = words(draft);
  const b = words(source);
  if (!a.length || !b.length) return 0;
  // Index source positions by word for an O(n·k) scan instead of full dynamic programming.
  const at = new Map<string, number[]>();
  b.forEach((w, i) => (at.get(w) ?? at.set(w, []).get(w)!).push(i));
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (const j of at.get(a[i]) ?? []) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) continue; // not the start of a run
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}

/** Share of the draft's 8-word sequences that also appear in the source (0–1). */
export function sharedShingles(draft: string, source: string, n = 8): number {
  const grams = (ws: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(" "));
    return out;
  };
  const a = grams(words(draft));
  if (!a.size) return 0;
  const b = grams(words(source));
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return shared / a.size;
}

/** Word-set similarity of two short texts (headlines, topics), 0–1. */
export function jaccard(x: string, y: string): number {
  const stop = new Set(["the", "a", "an", "of", "in", "on", "to", "and", "for", "at", "with", "as", "by", "is", "are", "after", "over", "from"]);
  const a = new Set(words(x).filter((w) => !stop.has(w)));
  const b = new Set(words(y).filter((w) => !stop.has(w)));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Quoted passages of four or more words in a text. */
export function quotations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["“]([^"”]{3,600})["”]/g)) {
    if (words(m[1]).length >= 4) out.push(m[1].trim());
  }
  return out;
}

/** Whether a quotation appears word for word in one of the sources. */
export function quoteFound(quote: string, sources: string[]): boolean {
  const q = words(quote).join(" ");
  return q.length > 0 && sources.some((s) => words(s).join(" ").includes(q));
}

const NUMBER_WORDS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Figures in a text, for checking that both language versions carry the same
 * ones: numbers of 10 or more and decimals, written as digits or (English) as
 * words such as "twelve". Small whole numbers are skipped because both
 * languages often write them as words.
 */
export function numbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(/\d[\d,.]*/g) ?? []) {
    const n = m.replace(/[,.]+$/, "").replace(/,/g, "");
    if (n.includes(".") || Number(n) >= 10) out.add(n);
  }
  for (const w of text.toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) ?? []) {
    const [tens, unit] = w.split("-");
    const units: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    if (NUMBER_WORDS[tens] !== undefined && (!unit || units[unit])) out.add(String(NUMBER_WORDS[tens] + (unit ? units[unit] : 0)));
  }
  return [...out].sort();
}

/** Registrable-ish domain of a URL ("www.bbc.co.uk" → "bbc.co.uk"), used to count independent publishers. */
export function publisherDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const secondLevel = parts.length > 2 && ["co", "com", "org", "gov", "ac", "net"].includes(parts[parts.length - 2]);
    return parts.slice(secondLevel ? -3 : -2).join(".");
  } catch {
    return "";
  }
}

/** URL form used to compare links (no fragment, no trailing slash, lower-case host). */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const p of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(p)) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

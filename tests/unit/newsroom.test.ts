import { describe, expect, it } from "vitest";
import { inWindow, nextSlot, retryDelayMs, slotFor } from "@/lib/newsroom/schedule";
import { jaccard, longestSharedRun, normaliseUrl, numbers, publisherDomain, quoteFound, quotations, sharedShingles, withoutQuotes } from "@/lib/newsroom/similarity";
import { blockedDomainsIn, duplicateReason, extractJson, fingerprintOf, realSources } from "@/server/newsroom/pipeline";
import { monthKey, monthStart } from "@/server/ai/budget";

describe("schedule (Asia/Colombo)", () => {
  it("maps times to the 00:00, 06:00, 12:00 and 18:00 Sri Lanka slots", () => {
    // 2026-11-19 00:29 UTC = 05:59 Colombo → the 00:00 slot of the 19th
    expect(slotFor(new Date("2026-11-19T00:29:00Z")).key).toBe("2026-11-19T00:00+05:30");
    expect(slotFor(new Date("2026-11-19T00:30:00Z")).key).toBe("2026-11-19T06:00+05:30");
    expect(slotFor(new Date("2026-11-19T00:30:00Z")).start.toISOString()).toBe("2026-11-19T00:30:00.000Z");
    expect(slotFor(new Date("2026-11-18T18:30:00Z")).key).toBe("2026-11-19T00:00+05:30");
    expect(slotFor(new Date("2026-11-19T12:29:59Z")).key).toBe("2026-11-19T12:00+05:30");
    expect(nextSlot(new Date("2026-11-19T12:31:00Z")).key).toBe("2026-11-20T00:00+05:30");
  });

  it("lets a slot start only within three hours, and backs off retries", () => {
    const s = slotFor(new Date("2026-11-19T00:30:00Z"));
    expect(inWindow(s, new Date("2026-11-19T00:30:00Z"))).toBe(true);
    expect(inWindow(s, new Date("2026-11-19T03:29:00Z"))).toBe(true);
    expect(inWindow(s, new Date("2026-11-19T03:31:00Z"))).toBe(false);
    expect([1, 2].map(retryDelayMs)).toEqual([600_000, 1_200_000]);
  });
});

describe("budget month (Sri Lanka calendar)", () => {
  it("starts the month at local midnight", () => {
    expect(monthStart(new Date("2026-11-30T19:00:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z"); // already 1 December in Colombo
    expect(monthKey(new Date("2026-11-30T19:00:00Z"))).toBe("2026-12");
    expect(monthKey(new Date("2026-11-30T18:00:00Z"))).toBe("2026-11");
  });
});

const SOURCE =
  "The central bank raised its benchmark interest rate by half a percentage point on Tuesday, citing persistent inflation in food and energy prices, according to a statement released after the policy meeting in the capital.";

describe("similarity checks", () => {
  it("finds long shared passages and shared phrases", () => {
    const copied = "Officials said the central bank raised its benchmark interest rate by half a percentage point on Tuesday, citing persistent inflation.";
    const original = "Borrowing costs will rise after policymakers lifted the main lending rate by 0.5 points, pointing to stubborn price increases.";
    expect(longestSharedRun(copied, SOURCE)).toBeGreaterThanOrEqual(15);
    expect(longestSharedRun(original, SOURCE)).toBeLessThan(4);
    expect(sharedShingles(copied, SOURCE)).toBeGreaterThan(0.5);
    expect(sharedShingles(original, SOURCE)).toBe(0);
  });

  it("checks quotations word for word and keeps them out of the overlap check", () => {
    const text = 'The governor said "inflation remains far too high for comfort" on Tuesday.';
    expect(quotations(text)).toEqual(["inflation remains far too high for comfort"]);
    expect(quoteFound("Inflation remains far too high, for comfort", ["He said: inflation remains far too high for comfort."])).toBe(true);
    expect(quoteFound("inflation is too high", ["He said: inflation remains far too high for comfort."])).toBe(false);
    expect(withoutQuotes(text)).not.toContain("inflation");
  });

  it("compares numbers, headlines, domains and links", () => {
    expect(numbers("Rates rose to 8.5% from 8, affecting 1,200 firms.")).toEqual(["1200", "8.5"]);
    expect(numbers("Twelve people and twenty-one homes; 3 boats")).toEqual(["12", "21"]);
    expect(jaccard("Central bank raises interest rate", "Central bank raises interest rates")).toBeGreaterThan(0.6);
    expect(publisherDomain("https://www.bbc.co.uk/news/x")).toBe("bbc.co.uk");
    expect(publisherDomain("https://www.france24.com/article/x")).toBe("france24.com");
    expect(normaliseUrl("https://WWW.Reuters.com/a/?utm_source=x#top")).toBe("https://www.reuters.com/a");
    expect(blockedDomainsIn("The following domains are not accessible to our user agent: ['apnews.com', 'bbc.co.uk']. Read more: …")).toEqual(["apnews.com", "bbc.co.uk"]);
    expect(blockedDomainsIn("some other error")).toEqual([]);
  });
});

describe("source and duplicate rules", () => {
  const hits = [
    { url: "https://www.aljazeera.com/world/a", title: "A", pageAge: null },
    { url: "https://example-blog.com/b", title: "B", pageAge: null },
  ];

  it("keeps only real sources from trusted domains", () => {
    const out = realSources(
      [
        { url: "https://www.aljazeera.com/world/a/", publisher: "Al Jazeera" },
        { url: "https://www.aljazeera.com/world/invented", publisher: "Al Jazeera" },
        { url: "https://example-blog.com/b", publisher: "Blog" },
      ],
      hits,
    );
    expect(out.map((s) => s.publisher)).toEqual(["Al Jazeera"]);
    // Sites that block Anthropic's crawler are not on the list.
    expect(realSources([{ url: "https://www.reuters.com/world/a", publisher: "Reuters" }], [{ url: "https://www.reuters.com/world/a", title: "", pageAge: null }])).toEqual([]);
  });

  it("detects earlier coverage by source link or similar topic", () => {
    const candidate = { topic: "Central bank raises interest rate", development: "", newDevelopmentOfCoveredStory: false, eventTime: "", locations: [], entities: ["central bank"], importance: 4, sources: [{ url: "https://www.aljazeera.com/world/a", publisher: "Al Jazeera" }] };
    expect(duplicateReason(candidate, { headlines: [], fingerprints: [], urls: new Set(["https://www.aljazeera.com/world/a"]) })).toMatch(/already used/);
    expect(duplicateReason({ ...candidate, sources: [] }, { headlines: ["Central bank raises interest rate again"], fingerprints: [], urls: new Set() })).toMatch(/Similar/);
    expect(duplicateReason({ ...candidate, sources: [] }, { headlines: ["Earthquake strikes coastal region"], fingerprints: [], urls: new Set() })).toBeNull();
    expect(fingerprintOf("Bank raises rate", ["Central Bank"])).toBe("bank central raises rate");
  });
});

describe("reading JSON replies from tool runs", () => {
  it("accepts bare JSON, fenced JSON and JSON after explanatory text", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('I searched three sources.\n{"stories":[]}\nDone.')).toEqual({ stories: [] });
    expect(extractJson("no json here")).toBeNull();
  });
});

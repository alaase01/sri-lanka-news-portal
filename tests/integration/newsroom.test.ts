import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

import { db } from "@/server/db/client";
import type { AiClient, AiRequest, AiResponse, FetchedPage, SearchHit } from "@/server/ai/client";
import { DISCOVER_SYSTEM, RESEARCH_SYSTEM, WRITE_SYSTEM } from "@/server/newsroom/prompts";
import { executeRun, approveHeld, setEnabled, startManualRun, tick } from "@/server/newsroom/service";
import { worldCategoryId } from "@/server/newsroom/pipeline";
import { clearReservations } from "@/server/ai/budget";
import { bodyToPlainText } from "@/lib/content/markdown";
import { slotFor } from "@/lib/newsroom/schedule";
import { POST as tickRoute } from "@/app/api/internal/newsroom/tick/route";

/**
 * The newsroom pipeline end to end against the real database, with a simulated
 * Claude client (no request reaches Anthropic). Each test scripts what the
 * three AI steps return.
 */

const RUN = `nr${Date.now().toString(36)}`;
let adminId = "";
let worldId = "";
let budgetBefore = 20;
/** What existed before the tests, so clean-up removes only what the tests created (never real data). */
let noticesBefore = new Set<string>();
const scheduledRunIds: string[] = [];
let settingsBefore: { enabled: boolean; maxStoriesPerRun: number } = { enabled: false, maxStoriesPerRun: 2 };
const noSleep = async () => undefined;

const SOURCE_A = {
  url: `https://www.aljazeera.com/world/${RUN}-quake`,
  title: "Strong earthquake strikes off coast, tsunami warning lifted",
  text: "A magnitude 7.1 earthquake struck off the northern coast on Monday morning, the national geological agency said. Authorities issued a tsunami warning that was lifted two hours later. Officials said 12 people were injured and around 300 homes were damaged in three coastal districts. Rescue teams were deployed overnight.",
};
const SOURCE_B = {
  url: `https://www.france24.com/article/${RUN}-quake`,
  title: "Quake injures 12, damages homes",
  text: "The geological agency put the magnitude at 7.1. Twelve people were hurt, provincial officials said. The governor said \"our teams are reaching every affected village\" as aid convoys moved north.",
};

const ORIGINAL_EN = [
  "Twelve people were injured and about 300 houses damaged when a magnitude 7.1 earthquake hit the country's northern coastline on Monday, according to the national geological agency and provincial officials.",
  "A tsunami alert was issued shortly after the tremor and withdrawn roughly two hours later, authorities said. The damage was spread across three coastal districts.",
  "Emergency crews worked through the night, and aid convoys were heading north. The provincial governor said \"our teams are reaching every affected village\".",
  "Officials have not yet given an estimate of the total cost of the damage, and assessments in remote areas are continuing.",
].join("\n\n");
const ORIGINAL_SI = [
  "ජාතික භූ විද්‍යා ආයතනයට සහ පළාත් නිලධාරීන්ට අනුව, සඳුදා රටේ උතුරු වෙරළ ආසන්නයේ ඇති වූ රික්ටර් 7.1 ක භූ කම්පනයෙන් 12 දෙනෙකු තුවාල ලැබූ අතර නිවාස 300 ක් පමණ හානියට පත් විය.",
  "කම්පනයෙන් ටික වේලාවකට පසු සුනාමි අනතුරු ඇඟවීමක් නිකුත් කළ අතර පැය දෙකකට පමණ පසු එය ඉවත් කර ගත් බව බලධාරීහු පැවසූහ. හානිය වෙරළබඩ දිස්ත්‍රික්ක තුනක පැතිර ඇත.",
  "හදිසි සේවා කණ්ඩායම් රාත්‍රිය පුරා කටයුතු කළ අතර සහන රථ පෙළ උතුරට ගමන් කරමින් සිටියේය.",
  "හානියේ මුළු වටිනාකම පිළිබඳ ඇස්තමේන්තුවක් නිලධාරීන් තවමත් ලබා දී නොමැති අතර, දුෂ්කර ප්‍රදේශවල තක්සේරු කිරීම් දිගටම සිදු වේ.",
].join("\n\n");

type Script = {
  stories?: unknown[];
  discoverHits?: SearchHit[];
  research?: Record<string, unknown> | null;
  pages?: FetchedPage[];
  write?: { en: { headline: string; seoDescription: string; body: string }; si: { headline: string; seoDescription: string; body: string } }[];
  failFirst?: Error;
};

function candidate(over: Record<string, unknown> = {}) {
  return {
    topic: `Earthquake strikes northern coast ${RUN}`,
    development: "A strong earthquake hit the northern coast; injuries and damage reported.",
    newDevelopmentOfCoveredStory: false,
    eventTime: "Monday morning",
    locations: ["northern coast"],
    entities: ["geological agency", RUN],
    importance: 5,
    sources: [{ url: SOURCE_A.url, publisher: "Al Jazeera" }],
    ...over,
  };
}

const goodResearch = () => ({
  sufficient: true,
  insufficientReason: "",
  eventDate: "Monday",
  entities: ["national geological agency"],
  facts: [
    { statement: "A magnitude 7.1 earthquake hit off the northern coast on Monday.", kind: "confirmed", attribution: "national geological agency", sourceUrls: [SOURCE_A.url, SOURCE_B.url] },
    { statement: "12 people were injured.", kind: "official", attribution: "provincial officials", sourceUrls: [SOURCE_A.url, SOURCE_B.url] },
    { statement: "About 300 homes were damaged in three coastal districts.", kind: "official", attribution: "officials", sourceUrls: [SOURCE_A.url] },
    { statement: "A tsunami warning was lifted after two hours.", kind: "confirmed", attribution: "authorities", sourceUrls: [SOURCE_A.url] },
    { statement: "A made-up fact with an invented source.", kind: "confirmed", attribution: "x", sourceUrls: ["https://www.aljazeera.com/invented"] },
  ],
  quotes: [
    { speaker: "Provincial governor", text: "our teams are reaching every affected village", sourceUrl: SOURCE_B.url },
    { speaker: "Someone", text: "a quotation that appears in no source at all", sourceUrl: SOURCE_B.url },
  ],
  conflicts: [],
  uncertainties: ["Total cost of damage not yet known."],
  sources: [
    { url: SOURCE_A.url, publisher: "Al Jazeera", author: "", publishedAt: "" },
    { url: SOURCE_B.url, publisher: "France 24", author: "Staff", publishedAt: "" },
  ],
});

const goodWrite = (headline = `Magnitude 7.1 quake injures 12 on northern coast ${RUN}`) => ({
  en: { headline, seoDescription: "Twelve people were injured and about 300 homes damaged by a magnitude 7.1 earthquake.", body: ORIGINAL_EN },
  si: { headline: `උතුරු වෙරළේ භූ කම්පනයෙන් 12 දෙනෙකුට තුවාල ${RUN}`, seoDescription: "භූ කම්පනයෙන් 12 දෙනෙකු තුවාල ලැබූහ.", body: ORIGINAL_SI },
});

/** A fake Claude that answers each step from the script and records the requests. */
function fake(script: Script): AiClient & { calls: AiRequest[] } {
  const calls: AiRequest[] = [];
  let writes = 0;
  let failed = false;
  return {
    calls,
    async complete(req) {
      calls.push(req);
      if (script.failFirst && !failed) {
        failed = true;
        throw script.failFirst;
      }
      const base: AiResponse = { text: "{}", model: req.model, inputTokens: 5000, outputTokens: 1500, stopReason: "end_turn", webSearchRequests: 0, webFetchRequests: 0, searchHits: [], fetchedPages: [] };
      if (req.system === DISCOVER_SYSTEM) {
        return { ...base, text: JSON.stringify({ stories: script.stories ?? [candidate()] }), webSearchRequests: 3, searchHits: script.discoverHits ?? [{ url: SOURCE_A.url, title: SOURCE_A.title, pageAge: null }] };
      }
      if (req.system === RESEARCH_SYSTEM) {
        const pages = script.pages ?? [
          { url: SOURCE_A.url, title: SOURCE_A.title, text: SOURCE_A.text, retrievedAt: new Date().toISOString() },
          { url: SOURCE_B.url, title: SOURCE_B.title, text: SOURCE_B.text, retrievedAt: new Date().toISOString() },
        ];
        return { ...base, text: JSON.stringify(script.research === undefined ? goodResearch() : script.research), webSearchRequests: 1, webFetchRequests: pages.length, fetchedPages: pages, searchHits: [{ url: SOURCE_B.url, title: SOURCE_B.title, pageAge: null }] };
      }
      if (req.system === WRITE_SYSTEM) {
        const list = script.write ?? [goodWrite()];
        return { ...base, text: JSON.stringify(list[Math.min(writes++, list.length - 1)]) };
      }
      throw new Error("unexpected request");
    },
  };
}

async function manualRun(script: Script) {
  const client = fake(script);
  const r = await startManualRun(adminId, new Date());
  if (!r.ok) throw new Error(r.message);
  await executeRun(r.runId, { client, sleep: noSleep, models: { research: "claude-haiku-5-5", writing: "claude-sonnet-5-5" } });
  const run = await db.newsroomRun.findUniqueOrThrow({ where: { id: r.runId }, include: { stories: true } });
  return { run, client };
}

beforeAll(async () => {
  adminId = (await db.admin.create({ data: { email: `${RUN}@example.com`, passwordHash: "x" } })).id;
  worldId = (await worldCategoryId())!;
  expect(worldId).toBeTruthy();
  const s = await db.siteSettings.findUnique({ where: { id: 1 } });
  budgetBefore = s ? Number(s.aiMonthlyBudgetUsd) : 20;
  await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, aiMonthlyBudgetUsd: 1000 }, update: { aiMonthlyBudgetUsd: 1000 } });
  noticesBefore = new Set((await db.newsroomNotice.findMany({ select: { id: true } })).map((n) => n.id));
  const ns = await db.newsroomSettings.findUnique({ where: { id: 1 } });
  if (ns) settingsBefore = { enabled: ns.enabled, maxStoriesPerRun: ns.maxStoriesPerRun };
  await db.newsroomSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { enabled: false, lockRunId: null, lockedUntil: null, maxStoriesPerRun: 2 } });
});

beforeEach(async () => {
  clearReservations();
  await db.newsroomSettings.update({ where: { id: 1 }, data: { lockRunId: null, lockedUntil: null } });
});

afterAll(async () => {
  const stories = await db.newsroomStory.findMany({ where: { topic: { contains: RUN } }, select: { articleId: true } });
  const ids = stories.map((s) => s.articleId).filter((x): x is string => !!x);
  const runs = (await db.newsroomRun.findMany({ where: { OR: [{ triggeredById: adminId }, { id: { in: scheduledRunIds } }] }, select: { id: true } })).map((r) => r.id);
  await db.newsroomStory.deleteMany({ where: { OR: [{ topic: { contains: RUN } }, { runId: { in: runs } }] } });
  await db.article.deleteMany({ where: { id: { in: ids } } });
  await db.aiUsageLog.deleteMany({ where: { newsroomRunId: { in: runs } } });
  await db.newsroomRun.deleteMany({ where: { id: { in: runs } } });
  const created = (await db.newsroomNotice.findMany({ select: { id: true } })).map((n) => n.id).filter((id) => !noticesBefore.has(id));
  await db.newsroomNotice.deleteMany({ where: { id: { in: created } } });
  await db.newsroomSettings.update({ where: { id: 1 }, data: { ...settingsBefore, lockRunId: null, lockedUntil: null } });
  await db.siteSettings.update({ where: { id: 1 }, data: { aiMonthlyBudgetUsd: budgetBefore } });
  await db.auditLog.deleteMany({ where: { adminId } });
  await db.admin.delete({ where: { id: adminId } });
});

describe("a complete run", () => {
  it("creates one linked pair of drafts in World, and nothing else changes", async () => {
    const publishedBefore = await db.articleTranslation.count({ where: { status: "PUBLISHED" } });
    const updatedBefore = await db.articleTranslation.aggregate({ where: { status: "PUBLISHED" }, _max: { updatedAt: true } });
    const { run, client } = await manualRun({});

    expect(run.status).toBe("SUCCEEDED");
    expect(run).toMatchObject({ discovered: 1, selected: 1, drafted: 1, held: 0, failed: 0 });
    const story = run.stories[0];
    expect(story.status).toBe("DRAFTED");
    expect(story.copyrightRisk).toBe("LOW");
    expect(story.enWords).toBeLessThanOrEqual(400);
    expect(story.siWords).toBeLessThanOrEqual(400);

    const article = await db.article.findUniqueOrThrow({ where: { id: story.articleId! }, include: { translations: { include: { revisions: true } } } });
    expect(article.primaryCategoryId).toBe(worldId);
    expect(article.featuredMediaId).toBeNull(); // no copied images
    expect(article.translations.map((t) => t.locale).sort()).toEqual(["en", "si"]);
    for (const t of article.translations) {
      expect(t.status).toBe("DRAFT");
      expect(t.publishedAt).toBeNull();
      expect(t.scheduledAt).toBeNull();
      expect(t.revisions[0].note).toMatch(/automated newsroom/);
      expect(t.metaDescription?.length).toBeGreaterThan(10);
    }
    expect(bodyToPlainText(article.translations.find((t) => t.locale === "en")!.body as never)).toContain("Twelve people were injured");

    // Research record: real sources only, invented fact and unfound quotation dropped, no source text stored.
    const research = story.research as { sources: { url: string }[]; facts: unknown[]; droppedFacts: number; droppedQuotes: string[]; independentPublishers: string[] };
    expect(research.sources.map((s) => s.url)).toEqual([SOURCE_A.url, SOURCE_B.url]);
    expect(research.droppedFacts).toBe(1);
    expect(research.droppedQuotes).toEqual(["a quotation that appears in no source at all"]);
    expect(research.independentPublishers.sort()).toEqual(["aljazeera.com", "france24.com"]);
    expect(JSON.stringify(story.research)).not.toContain("Rescue teams were deployed overnight");

    // The writer saw only facts, never the source text.
    const writeCall = client.calls.find((c) => c.system === WRITE_SYSTEM)!;
    expect(writeCall.user).not.toContain(SOURCE_A.text.slice(0, 60));
    expect(writeCall.tools).toBeUndefined();
    // Research tools were limited to trusted domains.
    expect(client.calls[0].tools?.search?.allowedDomains).toContain("aljazeera.com");

    // Real usage was logged with searches and cost.
    const usage = await db.aiUsageLog.findMany({ where: { newsroomRunId: run.id } });
    expect(usage.map((u) => u.operation).sort()).toEqual(["newsroom.discover", "newsroom.research", "newsroom.write"]);
    expect(usage.find((u) => u.operation === "newsroom.discover")!.webSearchRequests).toBe(3);
    expect(Number(run.costUsd)).toBeGreaterThan(0.03); // includes $0.01 per search

    expect(await db.articleTranslation.count({ where: { status: "PUBLISHED" } })).toBe(publishedBefore);
    const updatedAfter = await db.articleTranslation.aggregate({ where: { status: "PUBLISHED" }, _max: { updatedAt: true } });
    expect(updatedAfter._max.updatedAt).toEqual(updatedBefore._max.updatedAt);
  });

  it("does not draft the same development twice", async () => {
    const { run } = await manualRun({});
    expect(run).toMatchObject({ discovered: 1, duplicates: 1, drafted: 0 });
    expect(run.stories[0].reason).toMatch(/^Duplicate/);
  });
});

describe("selection and verification", () => {
  it("drops invented sources and stories without real sources", async () => {
    const c = candidate({ topic: `Invented summit story ${RUN} alpha`, entities: ["summit", `${RUN}a`], sources: [{ url: "https://www.aljazeera.com/not-in-results", publisher: "Al Jazeera" }] });
    const { run } = await manualRun({ stories: [c] });
    expect(run).toMatchObject({ insufficient: 1, drafted: 0 });
    expect(run.stories[0].reason).toMatch(/No source from the trusted list/);
  });

  it("rejects stories without enough verified facts, and minor stories", async () => {
    const c = candidate({ topic: `Port strike in distant city ${RUN} beta`, entities: ["dock workers", `${RUN}b`], sources: [{ url: `https://www.aljazeera.com/${RUN}-strike`, publisher: "Al Jazeera" }] });
    const minor = candidate({ topic: `Celebrity wedding ${RUN} gamma`, entities: [`${RUN}g`], importance: 2, sources: [{ url: `https://www.cbc.ca/${RUN}-wedding`, publisher: "CBC" }] });
    const { run } = await manualRun({
      stories: [c, minor],
      discoverHits: [
        { url: `https://www.aljazeera.com/${RUN}-strike`, title: "Strike", pageAge: null },
        { url: `https://www.cbc.ca/${RUN}-wedding`, title: "Wedding", pageAge: null },
      ],
      research: { ...goodResearch(), sufficient: false, insufficientReason: "Only one unconfirmed report", facts: [] },
    });
    expect(run).toMatchObject({ insufficient: 1, drafted: 0 });
    expect(run.stories.find((s) => s.topic.includes("wedding"))!.reason).toMatch(/Not significant/);
  });
});

describe("copyright screen", () => {
  const TOPICS: Record<string, string> = { h: "Volcano eruption grounds regional flights", m: "Typhoon forces mass evacuation along coast", n: "Parliament approves sweeping pension reform", l: "Satellite launch delayed by fuel leak" };
  const story = (n: string) =>
    candidate({ topic: `${TOPICS[n]} ${RUN}${n}`, entities: [`${RUN}${n}`], sources: [{ url: `https://www.aljazeera.com/${RUN}-${n}`, publisher: "Al Jazeera" }] });
  const hits = (n: string) => [{ url: `https://www.aljazeera.com/${RUN}-${n}`, title: "x", pageAge: null }];
  const research = (n: string) => {
    const r = goodResearch();
    r.sources[0].url = `https://www.aljazeera.com/${RUN}-${n}`;
    r.facts.forEach((f) => (f.sourceUrls = f.sourceUrls.map((u) => (u === SOURCE_A.url ? `https://www.aljazeera.com/${RUN}-${n}` : u))));
    return r;
  };
  const pages = (n: string) => [
    { url: `https://www.aljazeera.com/${RUN}-${n}`, title: SOURCE_A.title, text: SOURCE_A.text, retrievedAt: null },
    { url: SOURCE_B.url, title: SOURCE_B.title, text: SOURCE_B.text, retrievedAt: null },
  ];

  it("rejects a draft that copies source wording (HIGH)", async () => {
    const copied = goodWrite(`Headline one ${RUN}`);
    copied.en.body = `${SOURCE_A.text}\n\n${ORIGINAL_EN}`;
    const { run } = await manualRun({ stories: [story("h")], discoverHits: hits("h"), research: research("h"), pages: pages("h"), write: [copied] });
    expect(run).toMatchObject({ copyright: 1, drafted: 0 });
    expect(run.stories[0]).toMatchObject({ status: "REJECTED", copyrightRisk: "HIGH" });
    expect(run.stories[0].articleId).toBeNull();
  });

  it("holds close wording or an unverified quotation for review (MEDIUM), outside the drafts", async () => {
    const close = goodWrite(`Headline two ${RUN}`);
    close.en.body = `${ORIGINAL_EN}\n\nAuthorities issued a tsunami warning that was lifted two hours later, officials said on Monday.\n\nA witness said "the whole street shook for a very long time".`;
    const { run } = await manualRun({ stories: [story("m")], discoverHits: hits("m"), research: research("m"), pages: pages("m"), write: [close] });
    expect(run).toMatchObject({ held: 1, drafted: 0 });
    const held = run.stories[0];
    expect(held).toMatchObject({ status: "HELD", copyrightRisk: "MEDIUM", articleId: null });
    expect(held.copyrightNotes).toMatch(/quotation/);
    expect(held.heldContent).toBeTruthy();

    // After review an editor can create the drafts; still drafts.
    const r = await approveHeld(held.id, new Date());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = await db.articleTranslation.findMany({ where: { articleId: r.articleId } });
      expect(t.map((x) => x.status)).toEqual(["DRAFT", "DRAFT"]);
    }
    expect((await approveHeld(held.id, new Date())).ok).toBe(false); // never twice
  });

  it("holds stories whose language versions disagree on numbers", async () => {
    const w = goodWrite(`Headline three ${RUN}`);
    w.si.body = ORIGINAL_SI.replace("12 දෙනෙකු", "15 දෙනෙකු");
    const { run } = await manualRun({ stories: [story("n")], discoverHits: hits("n"), research: research("n"), pages: pages("n"), write: [w] });
    expect(run.stories[0]).toMatchObject({ status: "HELD" });
    expect(run.stories[0].copyrightNotes).toMatch(/different numbers/);
  });

  it("retries an over-long article once, then gives up without creating anything", async () => {
    const long = goodWrite(`Headline four ${RUN}`);
    long.en.body = Array.from({ length: 9 }, () => ORIGINAL_EN).join("\n\n");
    const { run, client } = await manualRun({ stories: [story("l")], discoverHits: hits("l"), research: research("l"), pages: pages("l"), write: [long, long] });
    expect(client.calls.filter((c) => c.system === WRITE_SYSTEM)).toHaveLength(2);
    expect(client.calls.filter((c) => c.system === WRITE_SYSTEM)[1].user).toMatch(/previous version had/);
    expect(run).toMatchObject({ failed: 1, drafted: 0 });
  });
});

describe("failures, budget and scheduling", () => {
  it("retries temporary API errors", async () => {
    const { run } = await manualRun({ stories: [candidate({ topic: `Retry story ${RUN}`, entities: [`${RUN}r`], sources: [{ url: `https://www.aljazeera.com/${RUN}-r`, publisher: "Al Jazeera" }] })], discoverHits: [{ url: `https://www.aljazeera.com/${RUN}-r`, title: "r", pageAge: null }], research: null, failFirst: new Anthropic.RateLimitError(429, {}, "slow down", new Headers()) });
    expect(run.status).toBe("SUCCEEDED");
    const logs = await db.aiUsageLog.findMany({ where: { newsroomRunId: run.id, operation: "newsroom.discover" } });
    expect(logs.map((l) => l.success).sort()).toEqual([false, true]);
  });

  it("skips sites that block Anthropic's crawler and tries again", async () => {
    const refusal = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "The following domains are not accessible to our user agent: ['cbc.ca', 'npr.org']. Read more: https://support.anthropic.com" } }, "400", new Headers());
    const { run, client } = await manualRun({ stories: [], failFirst: refusal });
    expect(run.status).toBe("SUCCEEDED");
    const discover = client.calls.filter((c) => c.system === DISCOVER_SYSTEM);
    expect(discover).toHaveLength(2);
    expect(discover[0].tools?.search?.allowedDomains).toContain("cbc.ca");
    expect(discover[1].tools?.search?.allowedDomains).not.toContain("cbc.ca");
    expect(discover[1].tools?.search?.allowedDomains).not.toContain("npr.org");
    expect(await db.newsroomNotice.count({ where: { message: { contains: "do not allow Anthropic's crawler" }, AND: [{ message: { contains: "cbc.ca" } }, { message: { contains: "npr.org" } }] } })).toBe(1);
  });

  it("stops when the monthly budget is used up and says why", async () => {
    await db.siteSettings.update({ where: { id: 1 }, data: { aiMonthlyBudgetUsd: 0 } });
    const r = await startManualRun(adminId, new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/budget/);
    await db.siteSettings.update({ where: { id: 1 }, data: { aiMonthlyBudgetUsd: 1000 } });
  });

  it("only allows scheduling after a successful manual run, runs each slot once and never overlaps", async () => {
    await db.newsroomSettings.update({ where: { id: 1 }, data: { enabled: false } });
    // Pick a time early in a slot far in the future so it cannot clash with real data.
    const at = new Date(slotFor(new Date("2030-01-01T01:00:00Z")).start.getTime() + 60_000);
    expect(await tick(at)).toEqual({ action: "disabled" });

    expect((await setEnabled(true, at)).ok).toBe(true); // manual runs above succeeded
    const first = await tick(at);
    expect(first.action).toBe("started");
    scheduledRunIds.push(first.runId!);
    const again = await tick(new Date(at.getTime() + 600_000));
    expect(again.action).toBe("nothing"); // same slot never twice
    // The first run still holds the lock: a manual run cannot overlap it.
    expect((await startManualRun(adminId, new Date(at.getTime() + 600_000))).ok).toBe(false);
    await db.newsroomRun.update({ where: { id: first.runId! }, data: { status: "FAILED", finishedAt: at } });
    await db.newsroomSettings.update({ where: { id: 1 }, data: { lockRunId: null, lockedUntil: null } });
    expect((await tick(new Date(at.getTime() + 5 * 60_000))).action).toBe("nothing"); // waits before retrying
    expect((await tick(new Date(at.getTime() + 11 * 60_000))).action).toBe("retrying");
    expect((await tick(new Date(at.getTime() + 4 * 3_600_000))).action).toBe("outside-window");
    await setEnabled(false, at);
  });

  it("the timer endpoint refuses requests without the server secret", async () => {
    const res = await tickRoute(new Request("http://localhost/api/internal/newsroom/tick", { method: "POST", headers: { authorization: "Bearer guess" } }));
    expect(res.status).toBe(404);
  });
});

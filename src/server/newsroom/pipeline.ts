import "server-only";
import { z } from "zod";
import type { CopyrightRisk, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { newsroomEnv } from "@/config/env";
import { wordCount, type BodyDoc } from "@/lib/content/body";
import { markdownToBody, bodyToPlainText } from "@/lib/content/markdown";
import { isValidSlug, RESERVED_SLUGS, slugify } from "@/lib/content/slug";
import { jaccard, longestSharedRun, normaliseUrl, numbers, publisherDomain, quoteFound, quotations, sharedShingles, withoutQuotes, words } from "@/lib/newsroom/similarity";
import { AiError, classifyError, defaultClient, describeError, type AiClient, type AiErrorCode, type AiRequest, type AiResponse, type FetchedPage, type SearchHit } from "@/server/ai/client";
import { estimateCostUsd } from "@/server/ai/pricing";
import { noteBudgetLevel, reserve, worstCaseCost } from "@/server/ai/budget";
import { NEWSROOM_LIMITS, SIMILARITY, TRUSTED_DOMAINS } from "./config";
import { DISCOVER_SCHEMA, DISCOVER_SYSTEM, discoverUser, RESEARCH_SCHEMA, RESEARCH_SYSTEM, researchUser, WRITE_SCHEMA, WRITE_SYSTEM, writeUser } from "./prompts";

/**
 * One newsroom run: discover → (per story) duplicate check → research and
 * verification → writing (from facts only) → copyright screen → linked drafts.
 *
 * Only ever creates NEW articles with status DRAFT, in the World category. It
 * never publishes, schedules or edits an existing article: there is no code
 * path here that could.
 */

export type PipelineDeps = {
  client?: AiClient | null;
  now?: () => Date;
  /** Waits between retries of temporary API errors (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  models?: { research: string; writing: string };
};

const TRANSIENT: AiErrorCode[] = ["timeout", "rate_limited", "overloaded", "network"];

class BudgetExhausted extends Error {}

/**
 * Domains a site owner has closed to Anthropic's crawler. The API refuses a
 * request that lists them; they are then left out for as long as the server runs.
 */
const blockedDomains = new Set<string>();

/** The domains named in the API's "not accessible to our user agent" refusal, if that is the error. */
export function blockedDomainsIn(message: string): string[] {
  const m = /domains are not accessible to our user agent:\s*\[([^\]]*)\]/i.exec(message);
  return m ? [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => (x[1] ?? x[2]).toLowerCase()) : [];
}

function withoutBlocked(tools: AiRequest["tools"]): AiRequest["tools"] {
  if (!tools) return tools;
  const keep = (list: string[]) => {
    const left = list.filter((d) => !blockedDomains.has(d));
    // An empty list would mean "any website": never send that.
    if (!left.length) throw new StepFailed("bad_request");
    return left;
  };
  return {
    ...(tools.search ? { search: { ...tools.search, allowedDomains: keep(tools.search.allowedDomains) } } : {}),
    ...(tools.fetch ? { fetch: { ...tools.fetch, allowedDomains: keep(tools.fetch.allowedDomains) } } : {}),
  };
}
class StepFailed extends Error {
  constructor(readonly code: AiErrorCode) {
    super(`AI step failed: ${code}`);
  }
}

// ───────────────────────── AI calls with budget, logging and retries ─────────────────────────

type CallOptions = Omit<AiRequest, "model"> & { model: string; operation: string; inputEstimate: number };

async function callAi(runId: string, deps: Required<PipelineDeps>, opts: CallOptions): Promise<AiResponse> {
  const { operation, inputEstimate, ...req } = opts;
  const worst = worstCaseCost(req.model, inputEstimate, req.maxTokens, req.tools?.search?.maxUses ?? 0);
  if (worst === null) {
    console.error(`[newsroom] no price is known for model "${req.model}"; add it to src/server/ai/pricing.ts`);
    throw new StepFailed("bad_request");
  }
  const delays = [20_000, 60_000];
  let blockedRetries = 0;
  for (let attempt = 0; ; attempt++) {
    const release = await reserve(worst, deps.now());
    if (!release) throw new BudgetExhausted();
    try {
      const raw = await deps.client!.complete({ ...req, tools: withoutBlocked(req.tools) });
      await log(runId, operation, raw.model || req.model, raw, true, null, deps.now());
      return raw;
    } catch (e) {
      const code = classifyError(e);
      const detail = describeError(e);
      console.error(`[newsroom] ${operation} failed (${code}): ${detail}`);
      const usage = e instanceof AiError ? e.usage : null;
      await log(runId, operation, usage?.model ?? req.model, { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 }, false, code, deps.now());
      // A site that blocks Anthropic's crawler: respect it, leave it out, try again (not billed).
      const blocked = code === "bad_request" ? blockedDomainsIn(detail) : [];
      if (blocked.length && blockedRetries < 3) {
        blocked.forEach((d) => blockedDomains.add(d));
        blockedRetries++;
        attempt--;
        await db.newsroomNotice
          .upsert({
            where: { key: `blocked-${[...blockedDomains].sort().join(",")}`.slice(0, 190) },
            create: { key: `blocked-${[...blockedDomains].sort().join(",")}`.slice(0, 190), level: "warning", message: `These sites do not allow Anthropic's crawler and are skipped: ${[...blockedDomains].sort().join(", ")}. Remove them from TRUSTED_DOMAINS in src/server/newsroom/config.ts.` },
            update: {},
          })
          .catch(() => undefined);
        continue;
      }
      if (!TRANSIENT.includes(code) || attempt >= delays.length) throw new StepFailed(code);
      await deps.sleep(delays[attempt]);
    } finally {
      release();
    }
  }
}

async function log(
  runId: string,
  operation: string,
  model: string,
  raw: { inputTokens: number; outputTokens: number; webSearchRequests?: number; webFetchRequests?: number },
  success: boolean,
  errorCode: string | null,
  now: Date,
) {
  const searches = raw.webSearchRequests ?? 0;
  await db.aiUsageLog.create({
    data: {
      adminId: null,
      operation,
      provider: "anthropic",
      model: model.slice(0, 100),
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      webSearchRequests: searches,
      webFetchRequests: raw.webFetchRequests ?? 0,
      success,
      errorCode,
      estimatedCostUsd: raw.inputTokens || raw.outputTokens || searches ? estimateCostUsd(model, raw.inputTokens, raw.outputTokens, searches) : 0,
      newsroomRunId: runId,
      createdAt: now,
    },
  });
}

/** The JSON object in a reply: the whole text, or the outermost {...} in it (tool replies may add text or fences). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function parseJson<T>(schema: z.ZodType<T>, raw: AiResponse): T | null {
  if (raw.stopReason === "max_tokens" || raw.stopReason === "refusal") return null;
  const r = schema.safeParse(extractJson(raw.text));
  if (!r.success) console.error(`[newsroom] reply did not match the expected shape: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return r.success ? r.data : null;
}

// ───────────────────────── step 1: discover ─────────────────────────

const candidateSchema = z.object({
  topic: z.string().min(3).max(300),
  development: z.string().max(1500),
  newDevelopmentOfCoveredStory: z.boolean(),
  eventTime: z.string().max(100),
  locations: z.array(z.string().max(100)).max(10),
  entities: z.array(z.string().max(100)).max(15),
  importance: z.number().int().min(1).max(5),
  sources: z.array(z.object({ url: z.string().max(1000), publisher: z.string().max(200) })).max(10),
});
export type Candidate = z.infer<typeof candidateSchema>;

/** Keeps only sources that really appeared in the search results or were fetched, and come from trusted domains. */
export function realSources<T extends { url: string }>(sources: T[], hits: SearchHit[], pages: FetchedPage[] = []): T[] {
  const seen = new Set([...hits.map((h) => normaliseUrl(h.url)), ...pages.map((p) => normaliseUrl(p.url))]);
  const trusted = (u: string) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  };
  const out: T[] = [];
  const used = new Set<string>();
  for (const s of sources) {
    const n = normaliseUrl(s.url);
    if (seen.has(n) && trusted(s.url) && !used.has(n)) {
      used.add(n);
      out.push(s);
    }
  }
  return out;
}

// ───────────────────────── duplicates ─────────────────────────

export function fingerprintOf(topic: string, entities: string[]): string {
  return [...new Set(words(`${topic} ${entities.join(" ")}`))].sort().join(" ");
}

type Recent = { headlines: string[]; fingerprints: string[]; urls: Set<string> };

async function recentCoverage(now: Date): Promise<Recent> {
  const since = new Date(now.getTime() - 4 * 86_400_000);
  const [translations, stories] = await Promise.all([
    db.articleTranslation.findMany({
      where: { article: { deletedAt: null }, OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }, { publishedAt: { gte: since } }] },
      select: { headline: true },
      take: 400,
      orderBy: { createdAt: "desc" },
    }),
    db.newsroomStory.findMany({
      where: { createdAt: { gte: since }, status: { in: ["DRAFTED", "HELD"] } },
      select: { topic: true, fingerprint: true, research: true, enHeadline: true },
      take: 200,
    }),
  ]);
  const urls = new Set<string>();
  for (const s of stories) {
    const r = s.research as { sources?: { url: string }[] } | null;
    for (const src of r?.sources ?? []) urls.add(normaliseUrl(src.url));
  }
  return {
    headlines: [...translations.map((t) => t.headline), ...stories.flatMap((s) => [s.enHeadline ?? "", s.topic]).filter(Boolean)],
    fingerprints: stories.map((s) => s.fingerprint).filter(Boolean),
    urls,
  };
}

/** Why a candidate duplicates earlier coverage, or null. */
export function duplicateReason(c: Candidate, recent: Recent): string | null {
  const shared = c.sources.find((s) => recent.urls.has(normaliseUrl(s.url)));
  if (shared) return `A source was already used for an earlier story (${shared.url}).`;
  const text = `${c.topic} ${c.entities.join(" ")}`;
  let best = 0;
  let match = "";
  for (const h of [...recent.headlines, ...recent.fingerprints]) {
    const j = jaccard(text, h);
    if (j > best) {
      best = j;
      match = h;
    }
  }
  // A real new development of a covered story is allowed unless it is near-identical.
  const limit = c.newDevelopmentOfCoveredStory ? 0.8 : 0.5;
  return best >= limit ? `Similar to existing coverage (${Math.round(best * 100)}% word overlap): "${match.slice(0, 120)}".` : null;
}

// ───────────────────────── step 2: research ─────────────────────────

const researchSchema = z.object({
  sufficient: z.boolean(),
  insufficientReason: z.string().max(1000),
  eventDate: z.string().max(100),
  entities: z.array(z.string().max(100)).max(20),
  facts: z.array(z.object({ statement: z.string().max(600), kind: z.enum(["confirmed", "official", "allegation", "opinion", "unverified"]), attribution: z.string().max(200), sourceUrls: z.array(z.string().max(1000)).max(10) })).max(40),
  quotes: z.array(z.object({ speaker: z.string().max(200), text: z.string().max(400), sourceUrl: z.string().max(1000) })).max(10),
  conflicts: z.array(z.string().max(500)).max(10),
  uncertainties: z.array(z.string().max(500)).max(10),
  sources: z.array(z.object({ url: z.string().max(1000), publisher: z.string().max(200), author: z.string().max(200), publishedAt: z.string().max(100) })).max(15),
});
type ResearchReply = z.infer<typeof researchSchema>;

export type ResearchRecord = {
  candidate: Candidate;
  eventDate: string;
  entities: string[];
  facts: ResearchReply["facts"];
  quotes: ResearchReply["quotes"];
  droppedQuotes: string[];
  droppedFacts: number;
  conflicts: string[];
  uncertainties: string[];
  sources: (ResearchReply["sources"][number] & { accessedAt: string | null })[];
  independentPublishers: string[];
};

/** Checks the research reply against what was really read: sources, fact links and exact quotations. */
export function checkResearch(candidate: Candidate, reply: ResearchReply, hits: SearchHit[], pages: FetchedPage[]): ResearchRecord {
  const sources = realSources(reply.sources, hits, pages).map((s) => ({
    ...s,
    accessedAt: pages.find((p) => normaliseUrl(p.url) === normaliseUrl(s.url))?.retrievedAt ?? null,
  }));
  const valid = new Set(sources.map((s) => normaliseUrl(s.url)));
  let droppedFacts = 0;
  const facts = reply.facts
    .map((f) => ({ ...f, sourceUrls: f.sourceUrls.filter((u) => valid.has(normaliseUrl(u))) }))
    .filter((f) => {
      const ok = f.sourceUrls.length > 0;
      if (!ok) droppedFacts++;
      return ok;
    });
  const texts = pages.map((p) => p.text);
  const quotes = reply.quotes.filter((q) => quoteFound(q.text, texts) && words(q.text).length <= 30);
  const droppedQuotes = reply.quotes.filter((q) => !quotes.includes(q)).map((q) => q.text);
  const independentPublishers = [
    ...new Set(facts.filter((f) => f.kind === "confirmed" || f.kind === "official").flatMap((f) => f.sourceUrls.map(publisherDomain)).filter(Boolean)),
  ];
  return { candidate, eventDate: reply.eventDate, entities: reply.entities, facts, quotes, droppedQuotes, droppedFacts, conflicts: reply.conflicts, uncertainties: reply.uncertainties, sources, independentPublishers };
}

// ───────────────────────── step 3: write ─────────────────────────

const versionSchema = z.object({ headline: z.string().min(5).max(250), seoDescription: z.string().max(400), body: z.string().min(50).max(12_000) });
const writeSchema = z.object({ en: versionSchema, si: versionSchema });
export type Written = { en: { headline: string; seoDescription: string; body: BodyDoc; words: number }; si: { headline: string; seoDescription: string; body: BodyDoc; words: number } };

/** Paragraph-only bodies; anything else in the reply becomes plain paragraphs. */
function toBody(markdown: string): BodyDoc {
  const paragraphs = markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s*/, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const doc = markdownToBody(paragraphs.map((p) => p.replace(/([*[\]\\])/g, "\\$1")).join("\n\n"));
  return doc;
}

function writerFacts(r: ResearchRecord) {
  return {
    eventDate: r.eventDate,
    facts: r.facts.filter((f) => f.kind !== "unverified").map((f) => ({ statement: f.statement, kind: f.kind, attribution: f.attribution })),
    exactQuotations: r.quotes.map((q) => ({ speaker: q.speaker, text: q.text })),
    conflictingReports: r.conflicts,
    uncertainties: r.uncertainties,
  };
}

// ───────────────────────── copyright screen ─────────────────────────

export type Screen = { risk: CopyrightRisk; notes: string[]; metrics: { longestRun: number; sharedShingles: number; quotedWords: number } };

/** Code-based screen of the English draft against the sources read during research. */
export function screen(written: Written, record: ResearchRecord, pages: FetchedPage[], hits: SearchHit[]): Screen {
  const notes: string[] = [];
  let risk: CopyrightRisk = "LOW";
  const raise = (r: CopyrightRisk, note: string) => {
    notes.push(note);
    if (r === "HIGH" || (r === "MEDIUM" && risk === "LOW")) risk = r;
  };
  const enText = bodyToPlainText(written.en.body);
  const siText = bodyToPlainText(written.si.body);
  const unquoted = withoutQuotes(enText);

  let longestRun = 0;
  let shingles = 0;
  for (const p of pages) {
    longestRun = Math.max(longestRun, longestSharedRun(unquoted, p.text));
    shingles = Math.max(shingles, sharedShingles(unquoted, p.text));
  }
  if (!pages.length) raise("MEDIUM", "No source page could be read, so the wording could not be compared with the sources.");
  if (longestRun >= SIMILARITY.highRun || shingles >= SIMILARITY.highShingles) raise("HIGH", `The draft repeats source wording (longest shared passage ${longestRun} words; ${Math.round(shingles * 100)}% of 8-word phrases shared).`);
  else if (longestRun >= SIMILARITY.mediumRun || shingles >= SIMILARITY.mediumShingles) raise("MEDIUM", `Some wording is close to a source (longest shared passage ${longestRun} words; ${Math.round(shingles * 100)}% of 8-word phrases shared).`);

  const titles = [...pages.map((p) => p.title ?? ""), ...hits.map((h) => h.title)].filter(Boolean);
  const closeTitle = titles.find((t) => jaccard(written.en.headline, t) >= SIMILARITY.headlineJaccard);
  if (closeTitle) raise("MEDIUM", `The headline is close to a source headline ("${closeTitle.slice(0, 120)}").`);

  const quoted = quotations(enText);
  const quotedWords = quoted.reduce((n, q) => n + words(q).length, 0);
  const unverified = quoted.filter((q) => !quoteFound(q, pages.map((p) => p.text)));
  if (unverified.length) raise("MEDIUM", `${unverified.length} quotation(s) could not be found word for word in the sources.`);
  if (quotedWords > SIMILARITY.maxQuotedWords) raise("MEDIUM", `The draft quotes ${quotedWords} words; keep quotations short.`);

  if (record.independentPublishers.length < 2) raise("MEDIUM", "The main facts rest on a single publisher; a second independent source was not found.");
  if (record.conflicts.length) raise("MEDIUM", "Sources disagree on some points; check how the draft presents the disagreement.");

  const enNums = numbers(enText);
  const siNums = numbers(siText);
  if (enNums.join() !== siNums.join()) raise("MEDIUM", `The English and Sinhala versions contain different numbers (English: ${enNums.join(", ") || "none"}; Sinhala: ${siNums.join(", ") || "none"}).`);

  if (risk === "LOW") notes.push("No close wording, headline or unverified quotation found. Automated screening reduces risk but does not establish legal compliance; an editor must review before publishing.");
  return { risk, notes, metrics: { longestRun, sharedShingles: Math.round(shingles * 1000) / 1000, quotedWords } };
}

// ───────────────────────── drafts ─────────────────────────

export async function worldCategoryId(): Promise<string | null> {
  const c = await db.categoryTranslation.findFirst({ where: { locale: "en", slug: "world" }, select: { categoryId: true } });
  return c?.categoryId ?? null;
}

async function freeSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const root = (isValidSlug(base) && !RESERVED_SLUGS.has(base) ? base : `world-news-${Date.now().toString(36)}`).slice(0, 100).replace(/-+$/, "");
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const [article, category] = await Promise.all([
      tx.articleTranslation.findFirst({ where: { slug }, select: { id: true } }),
      tx.categoryTranslation.findFirst({ where: { slug }, select: { id: true } }),
    ]);
    if (!article && !category) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Creates one new article with an English and a Sinhala DRAFT in one transaction,
 * and links it to the story. Both versions or neither.
 */
export async function createDraftPair(storyId: string, categoryId: string, w: Written, now: Date): Promise<string> {
  return db.$transaction(async (tx) => {
    const story = await tx.newsroomStory.findUniqueOrThrow({ where: { id: storyId }, select: { articleId: true } });
    if (story.articleId) return story.articleId; // already created: never twice
    const slug = await freeSlug(tx, slugify(w.en.headline));
    const version = (locale: "en" | "si") => {
      const v = w[locale];
      const body = v.body as unknown as Prisma.InputJsonValue;
      const summary = v.seoDescription.slice(0, 300);
      return {
        locale,
        headline: v.headline,
        summary,
        body,
        slug,
        metaDescription: v.seoDescription.slice(0, 300),
        status: "DRAFT" as const,
        revisions: { create: { headline: v.headline, summary, body, status: "DRAFT" as const, note: "Created by the automated newsroom (draft, not published)" } },
      };
    };
    const article = await tx.article.create({
      data: { primaryCategoryId: categoryId, createdAt: now, translations: { create: [version("en"), version("si")] } },
      select: { id: true },
    });
    await tx.newsroomStory.update({ where: { id: storyId }, data: { articleId: article.id, status: "DRAFTED" } });
    return article.id;
  });
}

// ───────────────────────── the run ─────────────────────────

export type RunOutcome = { status: "SUCCEEDED" | "FAILED" | "SKIPPED"; message: string | null };

export async function runPipeline(runId: string, maxStories: number, depsIn: PipelineDeps = {}): Promise<RunOutcome> {
  const deps: Required<PipelineDeps> = {
    client: depsIn.client === undefined ? defaultClient() : depsIn.client,
    now: depsIn.now ?? (() => new Date()),
    sleep: depsIn.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    models: depsIn.models ?? { research: newsroomEnv.researchModel, writing: newsroomEnv.writingModel },
  };
  if (!deps.client) return { status: "FAILED", message: "No AI API key is configured on the server (ANTHROPIC_API_KEY)." };
  const categoryId = await worldCategoryId();
  if (!categoryId) return { status: "FAILED", message: 'The World category (English slug "world") was not found. Nothing was created.' };
  const count = (field: "discovered" | "selected" | "duplicates" | "insufficient" | "copyright" | "drafted" | "held" | "failed", by = 1) =>
    db.newsroomRun.update({ where: { id: runId }, data: { [field]: { increment: by } } });

  try {
    // 1. Discover
    const recent = await recentCoverage(deps.now());
    const user = discoverUser(deps.now(), NEWSROOM_LIMITS.candidates, recent.headlines.slice(0, 80));
    const found = await callAi(runId, deps, {
      operation: "newsroom.discover",
      model: deps.models.research,
      system: DISCOVER_SYSTEM,
      user,
      schema: DISCOVER_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 8_000,
      effort: "low",
      tools: { search: { maxUses: NEWSROOM_LIMITS.discoverySearches, allowedDomains: [...TRUSTED_DOMAINS] } },
      inputEstimate: 12_000 + NEWSROOM_LIMITS.discoverySearches * 12_000,
    });
    const parsed = parseJson(z.object({ stories: z.array(candidateSchema).max(10) }), found);
    if (!parsed) return { status: "FAILED", message: "The research step returned an unreadable reply." };

    const candidates = parsed.stories
      .map((c) => ({ ...c, sources: realSources(c.sources, found.searchHits ?? []) }))
      .sort((a, b) => b.importance - a.importance);
    await count("discovered", candidates.length);

    let drafted = 0;
    const inRun: Candidate[] = [];
    for (const c of candidates) {
      const fingerprint = fingerprintOf(c.topic, c.entities);
      const base = { runId, topic: c.topic.slice(0, 300), fingerprint };
      // Selection
      const dup = duplicateReason(c, recent) ?? (inRun.some((o) => jaccard(`${o.topic} ${o.entities.join(" ")}`, `${c.topic} ${c.entities.join(" ")}`) >= 0.5) ? "Same development as another story in this run." : null);
      if (dup) {
        await db.newsroomStory.create({ data: { ...base, status: "REJECTED", reason: `Duplicate: ${dup}`, research: { candidate: c } as unknown as Prisma.InputJsonValue } });
        await count("duplicates");
        continue;
      }
      if (c.importance < 3) {
        await db.newsroomStory.create({ data: { ...base, status: "REJECTED", reason: `Not significant enough (importance ${c.importance} of 5).`, research: { candidate: c } as unknown as Prisma.InputJsonValue } });
        continue;
      }
      if (!c.sources.length) {
        await db.newsroomStory.create({ data: { ...base, status: "REJECTED", reason: "No source from the trusted list was found in the search results.", research: { candidate: c } as unknown as Prisma.InputJsonValue } });
        await count("insufficient");
        continue;
      }
      if (drafted + (await db.newsroomStory.count({ where: { runId, status: "HELD" } })) >= maxStories) break;
      inRun.push(c);
      await count("selected");
      const story = await db.newsroomStory.create({ data: { ...base, status: "FAILED", reason: "In progress", research: { candidate: c } as unknown as Prisma.InputJsonValue } });

      try {
        // 2. Research and verify
        const researched = await callAi(runId, deps, {
          operation: "newsroom.research",
          model: deps.models.research,
          system: RESEARCH_SYSTEM,
          user: researchUser(c),
          schema: RESEARCH_SCHEMA as unknown as Record<string, unknown>,
          maxTokens: 8_000,
          effort: "low",
          tools: {
            search: { maxUses: NEWSROOM_LIMITS.factSearches, allowedDomains: [...TRUSTED_DOMAINS] },
            fetch: { maxUses: NEWSROOM_LIMITS.factFetches, allowedDomains: [...TRUSTED_DOMAINS], maxContentTokens: NEWSROOM_LIMITS.fetchTokens },
          },
          inputEstimate: 6_000 + NEWSROOM_LIMITS.factFetches * NEWSROOM_LIMITS.fetchTokens * 2 + NEWSROOM_LIMITS.factSearches * 12_000,
        });
        const reply = parseJson(researchSchema, researched);
        if (!reply) throw new StepFailed("bad_output");
        const pages = researched.fetchedPages ?? [];
        const hits = [...(found.searchHits ?? []), ...(researched.searchHits ?? [])];
        const record = checkResearch(c, reply, hits, pages);
        const solid = record.facts.filter((f) => f.kind === "confirmed" || f.kind === "official").length;
        const verification =
          record.independentPublishers.length >= 2 ? `Main facts confirmed by ${record.independentPublishers.length} independent publishers` : "Single publisher only";
        const researchJson = record as unknown as Prisma.InputJsonValue;
        if (!reply.sufficient || solid < NEWSROOM_LIMITS.minFacts) {
          await db.newsroomStory.update({
            where: { id: story.id },
            data: { status: "REJECTED", reason: `Insufficient evidence: ${reply.insufficientReason || `only ${solid} confirmed or official facts with real sources`}.`, research: researchJson, verification },
          });
          await count("insufficient");
          continue;
        }

        // 3. Write (from facts only), with one retry if too long
        let written: Written | null = null;
        let extra: string | undefined;
        for (let attempt = 0; attempt < 2 && !written; attempt++) {
          const out = await callAi(runId, deps, {
            operation: "newsroom.write",
            model: deps.models.writing,
            system: WRITE_SYSTEM,
            user: writeUser(writerFacts(record), extra),
            schema: WRITE_SCHEMA as unknown as Record<string, unknown>,
            maxTokens: 12_000,
            effort: "medium",
            inputEstimate: 8_000,
          });
          const w = parseJson(writeSchema, out);
          if (!w) throw new StepFailed("bad_output");
          const en = toBody(w.en.body);
          const si = toBody(w.si.body);
          const enWords = wordCount(en);
          const siWords = wordCount(si);
          if (enWords <= NEWSROOM_LIMITS.maxWords && siWords <= NEWSROOM_LIMITS.maxWords && enWords >= 60 && siWords >= 40) {
            written = { en: { ...w.en, headline: w.en.headline.trim(), body: en, words: enWords }, si: { ...w.si, headline: w.si.headline.trim(), body: si, words: siWords } };
          } else {
            extra = `Your previous version had ${enWords} English and ${siWords} Sinhala words. Each body must be between 150 and 380 words.`;
          }
        }
        if (!written) throw new StepFailed("bad_output");

        // 4. Copyright screen (code)
        const s = screen(written, record, pages, hits);
        const common = {
          research: { ...record, screen: s.metrics } as unknown as Prisma.InputJsonValue,
          verification,
          copyrightRisk: s.risk,
          copyrightNotes: s.notes.join("\n"),
          enHeadline: written.en.headline.slice(0, 250),
          siHeadline: written.si.headline.slice(0, 250),
          enWords: written.en.words,
          siWords: written.si.words,
          model: `${deps.models.research} + ${deps.models.writing}`,
        };
        if (s.risk === "HIGH") {
          await db.newsroomStory.update({ where: { id: story.id }, data: { ...common, status: "REJECTED", reason: "Copyright risk HIGH: rejected." } });
          await count("copyright");
          continue;
        }
        if (s.risk === "MEDIUM") {
          await db.newsroomStory.update({
            where: { id: story.id },
            data: { ...common, status: "HELD", reason: "Held for editor review (copyright or verification concerns).", heldContent: written as unknown as Prisma.InputJsonValue },
          });
          await count("held");
          continue;
        }

        // 5. Linked drafts in the World category
        await db.newsroomStory.update({ where: { id: story.id }, data: { ...common, reason: null } });
        await createDraftPair(story.id, categoryId, written, deps.now());
        await count("drafted");
        drafted++;
      } catch (e) {
        if (e instanceof BudgetExhausted) throw e;
        const code = e instanceof StepFailed ? e.code : "unknown";
        await db.newsroomStory.update({ where: { id: story.id }, data: { status: "FAILED", reason: `Failed (${code}). Nothing was created for this story.` } });
        await count("failed");
      }
    }
    return { status: "SUCCEEDED", message: null };
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      return { status: "SUCCEEDED", message: "Stopped: the monthly AI budget is used up, or the next step could exceed what is left. Drafts already created are kept." };
    }
    if (e instanceof StepFailed) return { status: "FAILED", message: `The AI service failed (${e.code}).` };
    throw e;
  } finally {
    await noteBudgetLevel(deps.now()).catch(() => undefined);
  }
}

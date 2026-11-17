import "server-only";
import { z } from "zod";
import { db } from "@/server/db/client";
import type { ArticleStatus, Prisma } from "@/generated/prisma/client";
import { aiEnv } from "@/config/env";
import type { Locale } from "@/lib/i18n/config";
import { cleanBody, emptyBody, MAX_BODY_CHARS, wordCount, type BodyDoc } from "@/lib/content/body";
import { bodyLinks, bodyToMarkdown, keepOnlyLinks, markdownToBody, plainTextToBody } from "@/lib/content/markdown";
import { createArticle, getArticleForEdit, LIMITS, saveArticle, type FieldErrors } from "@/server/admin/articles";
import { AiError, classifyError, defaultClient, type AiClient, type AiErrorCode, type AiResponse } from "./client";
import { estimateCostUsd } from "./pricing";
import { buildUserMessage, operationInfo, OPERATION_LABEL, outputSchema, requiredSourceLocale, SYSTEM_PROMPT, type Operation, type Style } from "./prompts";

/**
 * AI Editorial Assistant: generating suggestions and saving approved ones.
 * Callers (server actions, admin pages) must have checked the session first.
 *
 * Generating never changes an article. Generated text lives only in the
 * browser until an editor approves it; approve() then applies these rules:
 *  - a draft or hidden version is updated (its previous text stays in revisions);
 *  - a published or scheduled version is never changed: the text is stored as an
 *    "AI suggestion" revision that an editor can restore deliberately;
 *  - a translation into a language the article lacks creates a new draft version;
 *  - pasted text creates a new draft article.
 */

export const AI_LIMITS = {
  sourceChars: 15_000,
  headline: 400,
  instructions: 1_000,
  links: 5,
  linkChars: 500,
  alternatives: 5,
} as const;

const PROVIDER = "anthropic";

// ───────────────────────── input ─────────────────────────

export type GenerateInput = {
  mode: "article" | "paste";
  articleId: string | null;
  sourceLocale: Locale;
  /** Pasted mode only. */
  headline: string;
  text: string;
  operation: Operation;
  style: Style | null;
  instructions: string;
  sourceLinks: string[];
};

/** What "Approve and save" will do with this result. Recomputed on the server when saving. */
export type SaveTarget =
  | { kind: "update"; articleId: string; locale: Locale; status: ArticleStatus; updatedAt: string; headline: string }
  | { kind: "suggestion"; articleId: string; locale: Locale; status: ArticleStatus; updatedAt: string; headline: string }
  | { kind: "newTranslation"; articleId: string; locale: Locale; headline: string }
  | { kind: "newArticle"; locale: Locale };

export type GenerateResult = {
  operation: Operation;
  outputLocale: Locale;
  model: string;
  original: { headline: string; body: BodyDoc; locale: Locale };
  headline: string;
  /** Null for headline operations: the body is not changed. */
  body: BodyDoc | null;
  /** Alternatives for "headline_alternatives". */
  headlines: string[];
  removedLinks: number;
  target: SaveTarget;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
};

export type Failure = { ok: false; code: AiErrorCode | "invalid" | "limit" | "busy" | "not_found"; message: string };

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "The AI assistant is not set up yet: no API key is configured on the server.",
  timeout: "The AI service took too long to answer. Nothing was saved. Try again, or try a shorter text.",
  rate_limited: "The AI service is receiving too many requests right now. Wait a minute and try again.",
  overloaded: "The AI service is busy or temporarily unavailable. Try again in a few minutes.",
  auth: "The AI service rejected the server's API key. Ask the site administrator to check the AI settings.",
  bad_request: "The AI service could not process this request. Check the AI model setting, or try a shorter text.",
  network: "The server could not reach the AI service. Try again in a moment.",
  refused: "The AI service declined to process this text.",
  truncated: "The text was too long for one answer and the reply was cut off. Try a shorter text.",
  bad_output: "The AI reply could not be read. Try again.",
  unknown: "Something went wrong while contacting the AI service. Try again.",
};

const linkSchema = z
  .string()
  .trim()
  .max(AI_LIMITS.linkChars)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
    } catch {
      return false;
    }
  });

export function validateLinks(raw: string[]): { links: string[] } | { error: string } {
  const list = raw.map((l) => l.trim()).filter(Boolean);
  if (list.length > AI_LIMITS.links) return { error: `Add at most ${AI_LIMITS.links} source links.` };
  const links: string[] = [];
  for (const l of list) {
    const r = linkSchema.safeParse(l);
    if (!r.success) return { error: "Each source link must be a full web address starting with https:// or http://." };
    if (!links.includes(r.data)) links.push(r.data);
  }
  return { links };
}

// ───────────────────────── rate limiting ─────────────────────────

/** Requests in progress, per admin. Blocks double submissions and parallel tabs. */
const inFlight = new Set<string>();

export async function usageWindow(adminId: string, now: Date): Promise<{ lastHour: number; lastDay: number }> {
  const [lastHour, lastDay] = await Promise.all([
    db.aiUsageLog.count({ where: { adminId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
    db.aiUsageLog.count({ where: { adminId, createdAt: { gt: new Date(now.getTime() - 86_400_000) } } }),
  ]);
  return { lastHour, lastDay };
}

async function logUsage(entry: { adminId: string; operation: Operation; model: string; inputTokens: number; outputTokens: number; success: boolean; errorCode: string | null; now: Date }) {
  const cost = entry.inputTokens || entry.outputTokens ? estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens) : 0;
  await db.aiUsageLog.create({
    data: {
      adminId: entry.adminId,
      operation: entry.operation,
      provider: PROVIDER,
      model: entry.model.slice(0, 100),
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      success: entry.success,
      errorCode: entry.errorCode,
      estimatedCostUsd: cost,
      createdAt: entry.now,
    },
  });
}

// ───────────────────────── generate ─────────────────────────

export type GenerateDeps = { client?: AiClient | null; now?: Date; limits?: { hourly: number; daily: number }; models?: { main: string; light: string } };

const fullReply = z.object({ headline: z.string(), body: z.string() });
const headlineReply = z.object({ headline: z.string() });
const alternativesReply = z.object({ headlines: z.array(z.string()) });

function cleanHeadline(h: string): string {
  return h.replace(/\s+/g, " ").trim().slice(0, AI_LIMITS.headline);
}

async function targetFor(articleId: string | null, outputLocale: Locale): Promise<SaveTarget | null> {
  if (!articleId) return { kind: "newArticle", locale: outputLocale };
  const a = await db.article.findFirst({
    where: { id: articleId, deletedAt: null },
    select: { translations: { select: { locale: true, status: true, updatedAt: true, headline: true } } },
  });
  if (!a) return null;
  const t = a.translations.find((x) => x.locale === outputLocale);
  const sourceHeadline = a.translations[0]?.headline ?? "";
  if (!t) return { kind: "newTranslation", articleId, locale: outputLocale, headline: sourceHeadline };
  const live = t.status === "PUBLISHED" || t.status === "SCHEDULED";
  return { kind: live ? "suggestion" : "update", articleId, locale: outputLocale, status: t.status, updatedAt: t.updatedAt.toISOString(), headline: t.headline };
}

export async function generate(adminId: string, input: GenerateInput, deps: GenerateDeps = {}): Promise<{ ok: true; result: GenerateResult } | Failure> {
  const now = deps.now ?? new Date();
  const client = deps.client === undefined ? defaultClient() : deps.client;
  const limits = deps.limits ?? { hourly: aiEnv.hourlyLimit, daily: aiEnv.dailyLimit };
  if (!client) return { ok: false, code: "not_configured", message: MESSAGES.not_configured };

  // Source text: loaded from the database for an article, so it matches what is stored.
  let headline: string;
  let body: BodyDoc;
  const sourceLocale = input.sourceLocale;
  if (input.mode === "article") {
    if (!input.articleId) return { ok: false, code: "invalid", message: "Choose an article first." };
    const t = await db.articleTranslation.findFirst({
      where: { articleId: input.articleId, locale: input.sourceLocale, article: { deletedAt: null } },
      select: { headline: true, body: true },
    });
    if (!t) return { ok: false, code: "not_found", message: "That article or language version no longer exists. Reload the page." };
    headline = t.headline;
    body = cleanBody(t.body) ?? emptyBody();
  } else {
    headline = input.headline.trim();
    if (headline.length > AI_LIMITS.headline) return { ok: false, code: "invalid", message: `Keep the headline under ${AI_LIMITS.headline} characters.` };
    if (input.text.length > AI_LIMITS.sourceChars * 2) return { ok: false, code: "invalid", message: `The text is too long. The limit is ${AI_LIMITS.sourceChars.toLocaleString("en")} characters.` };
    body = plainTextToBody(input.text);
  }

  const info = operationInfo(input.operation, sourceLocale);
  const required = requiredSourceLocale(input.operation);
  if (required && required !== sourceLocale) {
    return { ok: false, code: "invalid", message: required === "si" ? "This translation needs Sinhala text. Choose the Sinhala version or change the text language." : "This translation needs English text. Choose the English version or change the text language." };
  }
  const markdown = bodyToMarkdown(body);
  if (markdown.length > AI_LIMITS.sourceChars) {
    return { ok: false, code: "invalid", message: `The article is too long for the assistant (${markdown.length.toLocaleString("en")} characters; the limit is ${AI_LIMITS.sourceChars.toLocaleString("en")}).` };
  }
  if (info.needsBody && wordCount(body) === 0) return { ok: false, code: "invalid", message: "There is no article text to work on." };
  if (info.headlinesOnly && !headline && wordCount(body) === 0) return { ok: false, code: "invalid", message: "Enter a headline or article text first." };
  if (input.instructions.length > AI_LIMITS.instructions) return { ok: false, code: "invalid", message: `Keep the instructions under ${AI_LIMITS.instructions} characters.` };
  const links = validateLinks(input.sourceLinks);
  if ("error" in links) return { ok: false, code: "invalid", message: links.error };

  const target = await targetFor(input.mode === "article" ? input.articleId : null, info.outputLocale);
  if (!target) return { ok: false, code: "not_found", message: "That article no longer exists. Reload the page." };

  // Limits: one request at a time per admin, and a cap per hour and per day.
  if (inFlight.has(adminId)) return { ok: false, code: "busy", message: "A request is already running. Wait for it to finish." };
  inFlight.add(adminId);
  try {
    const used = await usageWindow(adminId, now);
    if (used.lastHour >= limits.hourly || used.lastDay >= limits.daily) {
      return {
        ok: false,
        code: "limit",
        message: `You have reached the limit of ${used.lastHour >= limits.hourly ? `${limits.hourly} requests per hour` : `${limits.daily} requests per day`}. Try again later.`,
      };
    }

    const models = deps.models ?? { main: aiEnv.model, light: aiEnv.modelLight };
    const model = info.light ? models.light : models.main;
    let raw: AiResponse;
    try {
      raw = await client.complete({
        model,
        system: SYSTEM_PROMPT,
        user: buildUserMessage({ operation: input.operation, style: input.style, instructions: input.instructions, sourceLinks: links.links, sourceLocale, headline, bodyMarkdown: markdown }),
        schema: outputSchema(input.operation),
        // Includes the model's reasoning. Stays under the SDK's limit for non-streamed requests.
        maxTokens: info.headlinesOnly ? 4_000 : 20_000,
      });
    } catch (e) {
      const code = classifyError(e);
      const usage = e instanceof AiError ? e.usage : null;
      await logUsage({ adminId, operation: input.operation, model: usage?.model ?? model, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, success: false, errorCode: code, now });
      return { ok: false, code, message: MESSAGES[code] };
    }

    const fail = async (code: AiErrorCode) => {
      await logUsage({ adminId, operation: input.operation, model: raw.model || model, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, success: false, errorCode: code, now });
      return { ok: false as const, code, message: MESSAGES[code] };
    };
    if (raw.stopReason === "refusal") return fail("refused");
    if (raw.stopReason === "max_tokens" || raw.stopReason === "model_context_window_exceeded") return fail("truncated");

    let json: unknown;
    try {
      json = JSON.parse(raw.text);
    } catch {
      return fail("bad_output");
    }

    let outHeadline = headline;
    let outBody: BodyDoc | null = null;
    let headlines: string[] = [];
    let removedLinks = 0;
    if (input.operation === "headline_alternatives") {
      const r = alternativesReply.safeParse(json);
      headlines = r.success ? r.data.headlines.map(cleanHeadline).filter(Boolean).slice(0, AI_LIMITS.alternatives) : [];
      if (!headlines.length) return fail("bad_output");
      outHeadline = headlines[0];
    } else if (input.operation === "headline_improve") {
      const r = headlineReply.safeParse(json);
      outHeadline = r.success ? cleanHeadline(r.data.headline) : "";
      if (!outHeadline) return fail("bad_output");
    } else {
      const r = fullReply.safeParse(json);
      if (!r.success) return fail("bad_output");
      outHeadline = cleanHeadline(r.data.headline);
      const parsed = markdownToBody(r.data.body);
      // Keep the article's own links; drop any link the model added.
      const kept = keepOnlyLinks(parsed, bodyLinks(body));
      outBody = kept.doc;
      removedLinks = kept.removed;
      if (!outHeadline || wordCount(outBody) === 0) return fail("bad_output");
    }

    const cost = estimateCostUsd(raw.model || model, raw.inputTokens, raw.outputTokens);
    await logUsage({ adminId, operation: input.operation, model: raw.model || model, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, success: true, errorCode: null, now });

    return {
      ok: true,
      result: {
        operation: input.operation,
        outputLocale: info.outputLocale,
        model: raw.model || model,
        original: { headline, body, locale: sourceLocale },
        headline: outHeadline,
        body: outBody,
        headlines,
        removedLinks,
        target,
        usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, estimatedCostUsd: cost },
      },
    };
  } finally {
    inFlight.delete(adminId);
  }
}

// ───────────────────────── approve and save ─────────────────────────

export type ApproveInput = {
  operation: Operation;
  mode: "article" | "paste";
  articleId: string | null;
  /** Language of the generated text. */
  locale: Locale;
  /** updatedAt of the target version when the suggestion was generated; null when it did not exist. */
  expectedUpdatedAt: string | null;
  headline: string;
  /** Null when only the headline changes. */
  body: unknown;
  /** New article or new language version only. */
  slug: string;
  primaryCategoryId: string;
};

export type ApproveResult =
  | { ok: true; kind: SaveTarget["kind"]; articleId: string; locale: Locale; message: string }
  | { ok: false; message: string; errors: FieldErrors };

export async function approve(input: ApproveInput, now: Date): Promise<ApproveResult> {
  const headline = input.headline.replace(/\s+/g, " ").trim();
  const no = (message: string, errors: FieldErrors = {}): ApproveResult => ({ ok: false, message, errors });
  if (!headline) return no("Nothing was saved. Enter a headline.", { headline: "Enter a headline." });
  if (headline.length > LIMITS.headline) return no(`Nothing was saved. Keep the headline under ${LIMITS.headline} characters.`, { headline: `Keep the headline under ${LIMITS.headline} characters.` });

  let body: BodyDoc | null = null;
  if (input.body !== null) {
    body = cleanBody(input.body);
    if (!body || JSON.stringify(body).length > MAX_BODY_CHARS * 4) return no("Nothing was saved. The article text could not be read.");
    if (wordCount(body) === 0) return no("Nothing was saved. The article text is empty.", { body: "The article text is empty." });
  }
  const note = `AI Editorial Assistant: ${OPERATION_LABEL[input.operation]}`;

  // Pasted text → a new draft article.
  if (input.mode === "paste") {
    if (!body) return no("Nothing was saved. A new article needs article text; use a rewrite or translation.");
    const created = await createArticle({ locale: input.locale, headline, slug: input.slug.trim(), primaryCategoryId: input.primaryCategoryId }, now);
    if (!created.ok) return no("Nothing was saved. Fix the highlighted fields.", created.errors);
    const t = await db.articleTranslation.findFirstOrThrow({ where: { articleId: created.id, locale: input.locale }, select: { updatedAt: true } });
    const saved = await saveArticle(
      {
        articleId: created.id,
        locale: input.locale,
        expectedUpdatedAt: t.updatedAt.toISOString(),
        intent: "save",
        scheduledAt: null,
        shared: { primaryCategoryId: input.primaryCategoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
        translation: { headline, summary: "", body, slug: input.slug.trim(), seoTitle: "", metaDescription: "" },
        revisionNote: note,
      },
      now,
    );
    if (!saved.ok) return no(saved.message, saved.errors);
    return { ok: true, kind: "newArticle", articleId: created.id, locale: input.locale, message: "Saved as a new draft article. It is not on the site." };
  }

  if (!input.articleId) return no("Nothing was saved. The article is missing. Reload the page.");
  const article = await getArticleForEdit(input.articleId);
  if (!article || article.deletedAt) return no("Nothing was saved. That article no longer exists or is in the bin.");
  const current = article.translations[input.locale];
  const shared = {
    primaryCategoryId: article.primaryCategoryId,
    categoryIds: article.categoryIds,
    tagIds: article.tagIds,
    authorId: article.authorId,
    featuredMediaId: article.featuredMediaId,
  };

  // Translation into a language the article does not have yet → a new draft version.
  if (!current) {
    if (input.expectedUpdatedAt) return no("Nothing was saved. That language version was removed after the suggestion was made. Reload the page.");
    if (!body) return no("Nothing was saved. A new language version needs article text.");
    const saved = await saveArticle(
      {
        articleId: article.id,
        locale: input.locale,
        expectedUpdatedAt: null,
        intent: "save",
        scheduledAt: null,
        shared,
        translation: { headline, summary: "", body, slug: input.slug.trim(), seoTitle: "", metaDescription: "" },
        revisionNote: note,
      },
      now,
    );
    if (!saved.ok) return no(saved.message, saved.errors);
    return { ok: true, kind: "newTranslation", articleId: article.id, locale: input.locale, message: "Saved as a new draft language version. It is not on the site." };
  }

  // Never overwrite text that changed after the suggestion was made.
  if (input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return no("Nothing was saved. This article was changed after the suggestion was made. Generate the suggestion again so it is based on the latest text.");
  }

  const finalBody = body ?? current.body;

  // Published or scheduled → stored as a suggestion; the live text is not touched.
  if (current.status === "PUBLISHED" || current.status === "SCHEDULED") {
    await db.articleRevision.create({
      data: {
        translationId: current.id,
        headline,
        summary: current.summary,
        body: finalBody as unknown as Prisma.InputJsonValue,
        status: current.status,
        note: `AI suggestion (not applied): ${OPERATION_LABEL[input.operation]}`,
      },
    });
    return {
      ok: true,
      kind: "suggestion",
      articleId: article.id,
      locale: input.locale,
      message: "Saved as a suggestion in the article's history. The published article was not changed; open it and use Restore on the suggestion to apply it.",
    };
  }

  // Draft or hidden → updated; the previous text stays in the article's history.
  const saved = await saveArticle(
    {
      articleId: article.id,
      locale: input.locale,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      intent: "save",
      scheduledAt: null,
      shared,
      translation: { headline, summary: current.summary, body: finalBody, slug: current.slug, seoTitle: current.seoTitle, metaDescription: current.metaDescription },
      revisionNote: note,
    },
    now,
  );
  if (!saved.ok) return no(saved.message, saved.errors);
  return { ok: true, kind: "update", articleId: article.id, locale: input.locale, message: "Saved to the draft. The previous text is kept in the article's history." };
}

// ───────────────────────── page data ─────────────────────────

export type AiArticleOption = { id: string; versions: Partial<Record<Locale, { headline: string; status: ArticleStatus }>> };

export async function findArticles(q: string): Promise<AiArticleOption[]> {
  const query = q.trim().slice(0, 100);
  const rows = await db.article.findMany({
    where: { deletedAt: null, ...(query ? { translations: { some: { headline: { contains: query, mode: "insensitive" } } } } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: { id: true, translations: { select: { locale: true, headline: true, status: true } } },
  });
  return rows.map((r) => ({ id: r.id, versions: Object.fromEntries(r.translations.map((t) => [t.locale, { headline: t.headline, status: t.status }])) }));
}

export type AiSelectedArticle = {
  id: string;
  versions: Partial<Record<Locale, { headline: string; body: BodyDoc; status: ArticleStatus; words: number; slug: string }>>;
};

export async function selectedArticle(id: string): Promise<AiSelectedArticle | null> {
  const a = await db.article.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, translations: { select: { locale: true, headline: true, body: true, status: true, slug: true } } },
  });
  if (!a) return null;
  const versions: AiSelectedArticle["versions"] = {};
  for (const t of a.translations) {
    const body = cleanBody(t.body) ?? emptyBody();
    versions[t.locale] = { headline: t.headline, body, status: t.status, words: wordCount(body), slug: t.slug };
  }
  return { id: a.id, versions };
}

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { approve, generate, type GenerateInput, type GenerateResult } from "@/server/ai/assistant";
import type { AiClient, AiRequest, AiResponse } from "@/server/ai/client";
import { AiError } from "@/server/ai/client";
import { createArticle, getArticleForEdit, saveArticle } from "@/server/admin/articles";
import { bodyToPlainText } from "@/lib/content/markdown";
import { saveCategory } from "@/server/admin/taxonomy";

/**
 * AI Editorial Assistant against the real database with a simulated Claude
 * client. No request ever reaches the Anthropic API from these tests.
 */

const RUN = `ai${Date.now().toString(36)}`;
const NOW = new Date("2026-11-17T06:00:00Z");
let n = 0;
const slug = () => `${RUN}-${n++}`;
let adminId = "";
let categoryId = "";

const ORIGINAL = "පොලිසිය පැවසුවේ දෙදෙනෙකු තුවාල ලැබූ බවයි. See [the report](https://example.lk/r).";

/** A fake client that records requests and returns a scripted reply. */
function fake(reply: Partial<AiResponse> | ((req: AiRequest) => Partial<AiResponse>) | Error): AiClient & { calls: AiRequest[] } {
  const calls: AiRequest[] = [];
  return {
    calls,
    async complete(req) {
      calls.push(req);
      if (reply instanceof Error) throw reply;
      const r = typeof reply === "function" ? reply(req) : reply;
      return { text: "{}", model: req.model, inputTokens: 1200, outputTokens: 800, stopReason: "end_turn", ...r };
    },
  };
}

const full = (headline: string, body: string) => fake({ text: JSON.stringify({ headline, body }) });

async function draft(locale: "si" | "en" = "si", text = ORIGINAL) {
  const c = await createArticle({ locale, headline: "මුල් ශීර්ෂය", slug: slug(), primaryCategoryId: categoryId }, NOW);
  if (!c.ok) throw new Error(JSON.stringify(c.errors));
  const a = await getArticleForEdit(c.id);
  const t = a!.translations[locale]!;
  const r = await saveArticle(
    {
      articleId: c.id,
      locale,
      expectedUpdatedAt: t.updatedAt.toISOString(),
      intent: "save",
      scheduledAt: null,
      shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
      translation: { headline: "මුල් ශීර්ෂය", summary: "සාරාංශය", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: text.replace(/ See \[.*$/, " See ") }, { type: "text", text: "the report", marks: [{ type: "link", attrs: { href: "https://example.lk/r" } }] }] }] }, slug: t.slug, seoTitle: "", metaDescription: "" },
    },
    NOW,
  );
  if (!r.ok) throw new Error(r.message);
  return c.id;
}

async function publish(articleId: string, locale: "si" | "en" = "si") {
  const a = await getArticleForEdit(articleId);
  const t = a!.translations[locale]!;
  const r = await saveArticle(
    {
      articleId,
      locale,
      expectedUpdatedAt: t.updatedAt.toISOString(),
      intent: "publish",
      scheduledAt: null,
      shared: { primaryCategoryId: categoryId, categoryIds: [], tagIds: [], authorId: null, featuredMediaId: null },
      translation: { headline: t.headline, summary: t.summary, body: t.body, slug: t.slug, seoTitle: "", metaDescription: "" },
    },
    NOW,
  );
  if (!r.ok) throw new Error(r.message);
}

const input = (over: Partial<GenerateInput>): GenerateInput => ({
  mode: "article",
  articleId: null,
  sourceLocale: "si",
  headline: "",
  text: "",
  operation: "rewrite",
  style: "professional",
  instructions: "",
  sourceLinks: [],
  ...over,
});

const big = { hourly: 1000, daily: 1000 };
/** Fixed models, so the tests do not depend on AI_MODEL / AI_MODEL_LIGHT in a local .env. */
const MODELS = { main: "claude-sonnet-5-5", light: "claude-haiku-5-5" };

async function ok(promise: ReturnType<typeof generate>): Promise<GenerateResult> {
  const r = await promise;
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.result;
}

beforeAll(async () => {
  const admin = await db.admin.create({ data: { email: `${RUN}@example.com`, passwordHash: "x" } });
  adminId = admin.id;
  const cat = await saveCategory({ id: null, parentId: null, sortOrder: 99, isVisible: false, si: { name: "පරීක්ෂණ", slug: `${RUN}-cat` }, en: { name: "Test", slug: `${RUN}-cat` } });
  if (!cat.ok) throw new Error("setup failed");
  categoryId = cat.id;
});

afterAll(async () => {
  await db.article.deleteMany({ where: { primaryCategoryId: categoryId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.aiUsageLog.deleteMany({ where: { adminId } });
  await db.auditLog.deleteMany({ where: { adminId } });
  await db.admin.delete({ where: { id: adminId } });
});

describe("generating", () => {
  it("reports 'not configured' without an API key and logs nothing", async () => {
    const r = await generate(adminId, input({ mode: "paste", text: "text" }), { client: null, now: NOW, limits: big, models: MODELS });
    expect(r).toMatchObject({ ok: false, code: "not_configured" });
    expect(await db.aiUsageLog.count({ where: { adminId } })).toBe(0);
  });

  it("rewrites an article without changing it, and logs real usage without text", async () => {
    const id = await draft();
    const before = await db.articleTranslation.findFirstOrThrow({ where: { articleId: id, locale: "si" } });
    const client = full("නව ශීර්ෂය", "පොලිසිය **පැවසුවේ** දෙදෙනෙකු තුවාල ලැබූ බවයි. [the report](https://example.lk/r) [extra](https://evil.example)");
    const r = await ok(generate(adminId, input({ articleId: id }), { client, now: NOW, limits: big, models: MODELS }));

    expect(r.headline).toBe("නව ශීර්ෂය");
    expect(r.outputLocale).toBe("si");
    expect(r.removedLinks).toBe(1);
    expect(JSON.stringify(r.body)).toContain("https://example.lk/r");
    expect(JSON.stringify(r.body)).not.toContain("evil.example");
    expect(r.target).toMatchObject({ kind: "update", status: "DRAFT" });
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 800, estimatedCostUsd: 0.0104 });

    // The request: main model, article text in the data section, the system prompt with the rules.
    expect(client.calls[0].model).toBe("claude-sonnet-5-5");
    expect(client.calls[0].user).toContain("<article>");
    expect(client.calls[0].system).toContain("Do not invent");

    const after = await db.articleTranslation.findFirstOrThrow({ where: { articleId: id, locale: "si" } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.headline).toBe(before.headline);

    const log = await db.aiUsageLog.findFirstOrThrow({ where: { adminId }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ operation: "rewrite", provider: "anthropic", model: "claude-sonnet-5-5", inputTokens: 1200, outputTokens: 800, success: true, errorCode: null });
    expect(Number(log.estimatedCostUsd)).toBeCloseTo(0.0104, 6);
    expect(JSON.stringify(log)).not.toContain("පොලිසිය");
  });

  it("uses the light model for headlines and returns alternatives", async () => {
    const id = await draft();
    const client = fake({ text: JSON.stringify({ headlines: ["එක", "දෙක", "තුන", "හතර", "පහ", "හය"] }) });
    const r = await ok(generate(adminId, input({ articleId: id, operation: "headline_alternatives" }), { client, now: NOW, limits: big, models: MODELS }));
    expect(client.calls[0].model).toBe("claude-haiku-5-5");
    expect(r.headlines).toEqual(["එක", "දෙක", "තුන", "හතර", "පහ"]);
    expect(r.body).toBeNull();
  });

  it("translates into the other language and targets a new version", async () => {
    const id = await draft();
    const r = await ok(generate(adminId, input({ articleId: id, operation: "translate_si_en" }), { client: full("Two injured, police say", "Police said two people were injured."), now: NOW, limits: big, models: MODELS }));
    expect(r.outputLocale).toBe("en");
    expect(r.target).toMatchObject({ kind: "newTranslation", locale: "en" });
  });

  it("rejects invalid input before calling the API", async () => {
    const client = fake({});
    const id = await draft();
    const cases: [Partial<GenerateInput>, RegExp][] = [
      [{ articleId: id, operation: "translate_en_si" }, /needs English/],
      [{ mode: "paste", text: "" }, /no article text/],
      [{ mode: "paste", text: "x".repeat(16_000) }, /too long/],
      [{ articleId: id, sourceLinks: ["javascript:alert(1)"] }, /https/],
      [{ articleId: id, instructions: "x".repeat(1001) }, /instructions/],
      [{ articleId: "doesnotexist" }, /no longer exists/],
    ];
    for (const [over, msg] of cases) {
      const r = await generate(adminId, input(over), { client, now: NOW, limits: big, models: MODELS });
      expect(r.ok, JSON.stringify(over).slice(0, 80)).toBe(false);
      if (!r.ok) expect(r.message).toMatch(msg);
    }
    expect(client.calls).toHaveLength(0);
  });

  it("handles API errors, timeouts and rate limits without changing anything", async () => {
    const id = await draft();
    const errors: [Error, string][] = [
      [new Anthropic.RateLimitError(429, {}, "rate limited", new Headers()), "rate_limited"],
      [new Anthropic.APIConnectionTimeoutError(), "timeout"],
      [new Anthropic.APIConnectionError({ message: "down" }), "network"],
      [new Anthropic.AuthenticationError(401, {}, "secret detail", new Headers()), "auth"],
      [new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()), "overloaded"],
      [new Error("boom"), "unknown"],
    ];
    for (const [err, code] of errors) {
      const r = await generate(adminId, input({ articleId: id }), { client: fake(err), now: NOW, limits: big, models: MODELS });
      expect(r).toMatchObject({ ok: false, code });
      if (!r.ok) expect(r.message).not.toMatch(/secret detail|boom|rate limited/);
    }
    const failed = await db.aiUsageLog.findMany({ where: { adminId, success: false, errorCode: { in: errors.map((e) => e[1]) } } });
    expect(failed.length).toBeGreaterThanOrEqual(errors.length);
    expect(failed.every((f) => f.inputTokens === 0 && Number(f.estimatedCostUsd) === 0)).toBe(true);
  });

  it("logs the tokens of unusable replies", async () => {
    const id = await draft();
    for (const [reply, code] of [
      [{ text: "not json" }, "bad_output"],
      [{ text: JSON.stringify({ headline: "x" }) }, "bad_output"],
      [{ text: "{", stopReason: "max_tokens" }, "truncated"],
      [{ text: "", stopReason: "refusal" }, "refused"],
    ] as const) {
      const r = await generate(adminId, input({ articleId: id }), { client: fake(reply), now: NOW, limits: big, models: MODELS });
      expect(r).toMatchObject({ ok: false, code });
    }
    const err = new AiError("bad_output", { inputTokens: 5, outputTokens: 6, model: "claude-sonnet-5-5" });
    await generate(adminId, input({ articleId: id }), { client: fake(err), now: NOW, limits: big, models: MODELS });
    expect(await db.aiUsageLog.count({ where: { adminId, errorCode: "truncated", inputTokens: 1200, outputTokens: 800 } })).toBeGreaterThan(0);
    expect(await db.aiUsageLog.count({ where: { adminId, errorCode: "bad_output", inputTokens: 5 } })).toBe(1);
  });

  it("limits requests per admin per hour, and one at a time", async () => {
    const id = await draft();
    const used = await db.aiUsageLog.count({ where: { adminId } });
    const r = await generate(adminId, input({ articleId: id }), { client: full("h", "b"), now: NOW, limits: { hourly: used, daily: 1000 }, models: MODELS });
    expect(r).toMatchObject({ ok: false, code: "limit" });

    let release: () => void = () => {};
    const slow: AiClient = { complete: () => new Promise((res) => (release = () => res({ text: JSON.stringify({ headline: "h", body: "b" }), model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, stopReason: "end_turn" }))) };
    const first = generate(adminId, input({ articleId: id }), { client: slow, now: NOW, limits: big, models: MODELS });
    await new Promise((r) => setTimeout(r, 200));
    const second = await generate(adminId, input({ articleId: id }), { client: full("h", "b"), now: NOW, limits: big, models: MODELS });
    expect(second).toMatchObject({ ok: false, code: "busy" });
    release();
    expect((await first).ok).toBe(true);
  });
});

describe("approving", () => {
  it("updates a draft and keeps the previous text in its history", async () => {
    const id = await draft();
    const r = await ok(generate(adminId, input({ articleId: id }), { client: full("නව ශීර්ෂය", "නව පාඨය."), now: NOW, limits: big, models: MODELS }));
    const t = r.target as Extract<GenerateResult["target"], { kind: "update" }>;
    const res = await approve({ operation: "rewrite", mode: "article", articleId: id, locale: "si", expectedUpdatedAt: t.updatedAt, headline: "සංස්කරණය කළ ශීර්ෂය", body: r.body, slug: "", primaryCategoryId: "" }, NOW);
    expect(res).toMatchObject({ ok: true, kind: "update" });

    const a = await getArticleForEdit(id);
    const v = a!.translations.si!;
    expect(v.headline).toBe("සංස්කරණය කළ ශීර්ෂය");
    expect(v.status).toBe("DRAFT");
    expect(v.summary).toBe("සාරාංශය");
    expect(bodyToPlainText(v.body)).toBe("නව පාඨය.");
    expect(v.revisions[0].note).toBe("AI Editorial Assistant: Rewrite the article");
    expect(v.revisions.some((rev) => rev.headline === "මුල් ශීර්ෂය")).toBe(true);
  });

  it("never changes a published article; stores a suggestion instead", async () => {
    const id = await draft();
    await publish(id);
    const before = await db.articleTranslation.findFirstOrThrow({ where: { articleId: id, locale: "si" } });
    const r = await ok(generate(adminId, input({ articleId: id, operation: "grammar" }), { client: full("නිවැරදි ශීර්ෂය", "නිවැරදි පාඨය."), now: NOW, limits: big, models: MODELS }));
    expect(r.target).toMatchObject({ kind: "suggestion", status: "PUBLISHED" });
    const res = await approve({ operation: "grammar", mode: "article", articleId: id, locale: "si", expectedUpdatedAt: (r.target as { updatedAt: string }).updatedAt, headline: r.headline, body: r.body, slug: "", primaryCategoryId: "" }, NOW);
    expect(res).toMatchObject({ ok: true, kind: "suggestion" });

    const after = await db.articleTranslation.findFirstOrThrow({ where: { articleId: id, locale: "si" } });
    expect(after).toEqual(before);
    const rev = await db.articleRevision.findFirstOrThrow({ where: { translationId: after.id }, orderBy: { createdAt: "desc" } });
    expect(rev.note).toMatch(/^AI suggestion \(not applied\)/);
    expect(rev.headline).toBe("නිවැරදි ශීර්ෂය");
  });

  it("refuses to save over text that changed after generating", async () => {
    const id = await draft();
    const r = await ok(generate(adminId, input({ articleId: id }), { client: full("h", "b"), now: NOW, limits: big, models: MODELS }));
    await publish(id); // someone else edits meanwhile
    const res = await approve({ operation: "rewrite", mode: "article", articleId: id, locale: "si", expectedUpdatedAt: (r.target as { updatedAt: string }).updatedAt, headline: "h", body: r.body, slug: "", primaryCategoryId: "" }, NOW);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.message).toMatch(/changed after the suggestion/);
  });

  it("creates a missing translation as a draft, and only with a valid slug", async () => {
    const id = await draft();
    await publish(id);
    const r = await ok(generate(adminId, input({ articleId: id, operation: "translate_si_en" }), { client: full("Two injured", "Police said two were injured."), now: NOW, limits: big, models: MODELS }));
    const base = { operation: "translate_si_en" as const, mode: "article" as const, articleId: id, locale: "en" as const, expectedUpdatedAt: null, headline: r.headline, body: r.body, primaryCategoryId: "" };
    const bad = await approve({ ...base, slug: "Not Valid" }, NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.slug).toBeTruthy();

    const good = await approve({ ...base, slug: slug() }, NOW);
    expect(good).toMatchObject({ ok: true, kind: "newTranslation", locale: "en" });
    const a = await getArticleForEdit(id);
    expect(a!.translations.en).toMatchObject({ headline: "Two injured", status: "DRAFT" });
    expect(a!.translations.si!.status).toBe("PUBLISHED");
  });

  it("saves pasted text as a new draft article", async () => {
    const r = await ok(generate(adminId, input({ mode: "paste", headline: "Pasted", text: "Line one.\n\nLine two.", operation: "grammar" }), { client: full("Pasted headline", "Line one.\n\nLine two."), now: NOW, limits: big, models: MODELS }));
    expect(r.target).toEqual({ kind: "newArticle", locale: "si" });
    const base = { operation: "grammar" as const, mode: "paste" as const, articleId: null, locale: "si" as const, expectedUpdatedAt: null, headline: r.headline, body: r.body };
    const noCategory = await approve({ ...base, slug: slug(), primaryCategoryId: "" }, NOW);
    expect(noCategory.ok).toBe(false);

    const res = await approve({ ...base, slug: slug(), primaryCategoryId: categoryId }, NOW);
    expect(res).toMatchObject({ ok: true, kind: "newArticle" });
    if (res.ok) {
      const a = await getArticleForEdit(res.articleId);
      expect(a!.translations.si).toMatchObject({ headline: "Pasted headline", status: "DRAFT" });
      expect(bodyToPlainText(a!.translations.si!.body)).toBe("Line one.\n\nLine two.");
    }
  });

  it("validates what is saved", async () => {
    const id = await draft();
    const t = (await getArticleForEdit(id))!.translations.si!;
    const base = { operation: "rewrite" as const, mode: "article" as const, articleId: id, locale: "si" as const, expectedUpdatedAt: t.updatedAt.toISOString(), slug: "", primaryCategoryId: "" };
    expect((await approve({ ...base, headline: " ", body: null }, NOW)).ok).toBe(false);
    expect((await approve({ ...base, headline: "x".repeat(201), body: null }, NOW)).ok).toBe(false);
    expect((await approve({ ...base, headline: "ok", body: { type: "doc", content: [] } }, NOW)).ok).toBe(false);
    expect((await approve({ ...base, headline: "ok", body: "<p>html</p>" }, NOW)).ok).toBe(false);
    // Headline-only change keeps the body.
    const res = await approve({ ...base, operation: "headline_improve", headline: "Better", body: null }, NOW);
    expect(res.ok).toBe(true);
    const after = (await getArticleForEdit(id))!.translations.si!;
    expect(after.headline).toBe("Better");
    expect(after.body).toEqual(t.body);
  });
});

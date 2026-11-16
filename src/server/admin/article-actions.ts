"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requestMeta } from "@/server/auth/session";
import { audit } from "@/server/auth/audit";
import { MAX_BODY_CHARS } from "@/lib/content/body";
import { fromColomboInput } from "@/lib/utils/dates";
import {
  binArticle,
  createArticle,
  restoreArticle,
  restoreRevision,
  saveArticle,
  type FieldErrors,
  type SaveIntent,
} from "./articles";

/*
 * Server actions for articles. Each one checks the session itself and validates
 * every field on the server; nothing the browser sends is trusted.
 */

const id = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);
const locale = z.enum(["si", "en"]);
const text = (max: number) => z.string().max(max).default("");

/** Public pages that list or show articles. */
function invalidateArticles() {
  updateTag("articles");
  updateTag("homepage");
  updateTag("tags");
}

export type CreateArticleState = { errors: FieldErrors; values: { headline: string; slug: string; locale: string; primaryCategoryId: string } };

const createSchema = z.object({
  locale,
  headline: text(400),
  slug: text(200),
  primaryCategoryId: z.string().max(40).default(""),
});

export async function createArticleAction(_prev: CreateArticleState, form: FormData): Promise<CreateArticleState> {
  const admin = await requireAdmin();
  const raw = {
    locale: form.get("locale"),
    headline: form.get("headline") ?? "",
    slug: form.get("slug") ?? "",
    primaryCategoryId: form.get("primaryCategoryId") ?? "",
  };
  const values = {
    headline: String(raw.headline).slice(0, 400),
    slug: String(raw.slug).slice(0, 200),
    locale: String(raw.locale ?? "si"),
    primaryCategoryId: String(raw.primaryCategoryId).slice(0, 40),
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { errors: { form: "The form could not be read. Reload the page." }, values };

  const result = await createArticle({ ...parsed.data, slug: parsed.data.slug.trim() }, new Date());
  if (!result.ok) return { errors: result.errors, values };

  await audit({
    adminId: admin.id,
    action: "article.create",
    entityType: "Article",
    entityId: result.id,
    ip: (await requestMeta()).ip,
    meta: { locale: parsed.data.locale },
  });
  redirect(`/admin/articles/${result.id}/${parsed.data.locale}`);
}

export type SaveArticleState = {
  ok: boolean | null;
  message: string;
  errors: FieldErrors;
  updatedAt: string | null;
  status: string | null;
  /** Increments on every successful save so the editor can tell a new result from an old one. */
  seq: number;
};

const saveSchema = z.object({
  articleId: id,
  locale,
  expectedUpdatedAt: z.string().max(40).default(""),
  intent: z.enum(["save", "publish", "schedule", "unpublish"]),
  scheduledAt: z.string().max(20).default(""),
  primaryCategoryId: z.string().max(40).default(""),
  categoryIds: z.array(id).max(10),
  tagIds: z.array(id).max(30),
  authorId: z.string().max(40).default(""),
  featuredMediaId: z.string().max(40).default(""),
  headline: text(400),
  summary: text(2000),
  body: z.string().max(MAX_BODY_CHARS * 4),
  slug: text(200),
  seoTitle: text(400),
  metaDescription: text(1000),
});

export async function saveArticleAction(prev: SaveArticleState, form: FormData): Promise<SaveArticleState> {
  const admin = await requireAdmin();
  const fail = (message: string, errors: FieldErrors = {}): SaveArticleState => ({ ...prev, ok: false, message, errors });

  const entries = Object.fromEntries(
    ["articleId", "locale", "expectedUpdatedAt", "intent", "scheduledAt", "primaryCategoryId", "authorId", "featuredMediaId", "headline", "summary", "body", "slug", "seoTitle", "metaDescription"].map(
      (k) => [k, form.get(k) ?? undefined],
    ),
  );
  const parsed = saveSchema.safeParse({ ...entries, categoryIds: form.getAll("categoryIds"), tagIds: form.getAll("tagIds") });
  if (!parsed.success) return fail("The form could not be read. Reload the page and try again.");
  const d = parsed.data;

  let body: unknown;
  try {
    body = JSON.parse(d.body);
  } catch {
    return fail("The article text could not be read. Reload the page and try again.");
  }
  if (JSON.stringify(body).length > MAX_BODY_CHARS * 4) return fail("The article is too long.");

  let scheduledAt: Date | null = null;
  if (d.intent === "schedule") {
    scheduledAt = fromColomboInput(d.scheduledAt);
    if (!scheduledAt) return fail("Nothing was saved. Fix the highlighted fields.", { scheduledAt: "Choose the date and time to publish." });
  }

  const result = await saveArticle(
    {
      articleId: d.articleId,
      locale: d.locale,
      expectedUpdatedAt: d.expectedUpdatedAt || null,
      intent: d.intent as SaveIntent,
      scheduledAt,
      shared: {
        primaryCategoryId: d.primaryCategoryId,
        categoryIds: d.categoryIds,
        tagIds: d.tagIds,
        authorId: d.authorId || null,
        featuredMediaId: d.featuredMediaId || null,
      },
      translation: {
        headline: d.headline,
        summary: d.summary,
        body,
        slug: d.slug.trim(),
        seoTitle: d.seoTitle,
        metaDescription: d.metaDescription,
      },
    },
    new Date(),
  );
  if (!result.ok) return fail(result.message, result.errors);

  invalidateArticles();
  await audit({
    adminId: admin.id,
    action: `article.${d.intent}`,
    entityType: "ArticleTranslation",
    entityId: result.translationId,
    ip: (await requestMeta()).ip,
    meta: { articleId: d.articleId, locale: d.locale, status: result.status, ...(result.slugChanged ? { slugChanged: true } : {}) },
  });

  const messages: Record<SaveIntent, string> = {
    save: result.status === "PUBLISHED" ? "Saved. The changes are live." : "Saved.",
    publish: "Published. It is now on the site.",
    schedule: "Scheduled. It will appear on the site at the chosen time.",
    unpublish: "Taken off the site. It is no longer visible to readers.",
  };
  return { ok: true, message: messages[d.intent as SaveIntent], errors: {}, updatedAt: result.updatedAt, status: result.status, seq: prev.seq + 1 };
}

export async function restoreRevisionAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const revisionId = id.safeParse(form.get("revisionId"));
  if (!revisionId.success) return;
  const result = await restoreRevision(revisionId.data);
  if (!result.ok) return;
  invalidateArticles();
  await audit({
    adminId: admin.id,
    action: "article.restore_revision",
    entityType: "ArticleRevision",
    entityId: revisionId.data,
    ip: (await requestMeta()).ip,
  });
  redirect(`/admin/articles/${result.articleId}/${result.locale}?restored=${Date.now().toString(36)}`);
}

export async function binArticleAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const articleId = id.safeParse(form.get("articleId"));
  if (!articleId.success || form.get("confirm") !== "yes") return;
  if (await binArticle(articleId.data, new Date())) {
    invalidateArticles();
    await audit({ adminId: admin.id, action: "article.bin", entityType: "Article", entityId: articleId.data, ip: (await requestMeta()).ip });
  }
  redirect("/admin/articles?binned=1");
}

export async function restoreArticleAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const articleId = id.safeParse(form.get("articleId"));
  if (!articleId.success) return;
  if (await restoreArticle(articleId.data)) {
    invalidateArticles();
    await audit({ adminId: admin.id, action: "article.restore", entityType: "Article", entityId: articleId.data, ip: (await requestMeta()).ip });
  }
  redirect(`/admin/articles/${articleId.data}/si`);
}

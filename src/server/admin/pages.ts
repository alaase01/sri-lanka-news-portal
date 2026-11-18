import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { locales, type Locale } from "@/lib/i18n/config";
import { bodyText, cleanBody, emptyBody, MAX_BODY_CHARS, wordCount, type BodyDoc } from "@/lib/content/body";

/**
 * Static pages (About, Contact, policies). The five pages are created by
 * migration; there is no create or delete. Each language version has a working
 * draft and a separate published copy:
 *  - "save" changes only the draft; visitors keep seeing the published copy;
 *  - "publish" saves the draft and copies it to the published copy;
 *  - "unpublish" saves the draft and takes the language version off the site.
 * A version cannot be published while it still contains a [[placeholder]].
 */

export const PAGE_LIMITS = { title: 200, seoTitle: 120, metaDescription: 300 } as const;

const PLACEHOLDER = /\[\[[\s\S]*?\]\]/g;

/** Every [[…]] placeholder left in the given texts. */
export function findPlaceholders(...texts: string[]): string[] {
  return texts.flatMap((t) => t.match(PLACEHOLDER) ?? []);
}

export type PageVersionState = "notStarted" | "draft" | "published" | "changed";

type Row = {
  locale: Locale;
  title: string;
  body: unknown;
  seoTitle: string;
  metaDescription: string;
  publishedTitle: string | null;
  publishedBody: unknown;
  publishedSeoTitle: string | null;
  publishedMetaDescription: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  updatedBy: { email: string } | null;
};

function stateOf(r: Row): PageVersionState {
  const body = cleanBody(r.body, { align: true }) ?? emptyBody();
  if (!r.isPublished) return !r.title.trim() && wordCount(body) === 0 ? "notStarted" : "draft";
  const same =
    r.title === r.publishedTitle &&
    r.seoTitle === (r.publishedSeoTitle ?? "") &&
    r.metaDescription === (r.publishedMetaDescription ?? "") &&
    JSON.stringify(body) === JSON.stringify(cleanBody(r.publishedBody, { align: true }));
  return same ? "published" : "changed";
}

const rowSelect = {
  locale: true,
  title: true,
  body: true,
  seoTitle: true,
  metaDescription: true,
  publishedTitle: true,
  publishedBody: true,
  publishedSeoTitle: true,
  publishedMetaDescription: true,
  isPublished: true,
  publishedAt: true,
  updatedAt: true,
  updatedBy: { select: { email: true } },
} as const;

export type PageListItem = {
  key: string;
  slug: string;
  versions: Partial<Record<Locale, { title: string; state: PageVersionState; placeholders: number; updatedAt: Date; updatedBy: string | null }>>;
};

export async function listPages(): Promise<PageListItem[]> {
  const pages = await db.staticPage.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, slug: true, translations: { select: rowSelect } } });
  return pages.map((p) => ({
    key: p.key,
    slug: p.slug,
    versions: Object.fromEntries(
      p.translations.map((t) => {
        const body = cleanBody(t.body, { align: true }) ?? emptyBody();
        return [
          t.locale,
          {
            title: t.title,
            state: stateOf(t),
            placeholders: findPlaceholders(t.title, bodyText(body), t.seoTitle, t.metaDescription).length,
            updatedAt: t.updatedAt,
            updatedBy: t.updatedBy?.email ?? null,
          },
        ];
      }),
    ),
  }));
}

export type PageVersionForEdit = {
  title: string;
  body: BodyDoc;
  seoTitle: string;
  metaDescription: string;
  state: PageVersionState;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
};

export type PageForEdit = { key: string; slug: string; versions: Record<Locale, PageVersionForEdit | null> };

export async function getPageForEdit(key: string): Promise<PageForEdit | null> {
  const p = await db.staticPage.findUnique({ where: { key }, select: { key: true, slug: true, translations: { select: rowSelect } } });
  if (!p) return null;
  const versions = { si: null, en: null } as Record<Locale, PageVersionForEdit | null>;
  for (const t of p.translations) {
    versions[t.locale] = {
      title: t.title,
      body: cleanBody(t.body, { align: true }) ?? emptyBody(),
      seoTitle: t.seoTitle,
      metaDescription: t.metaDescription,
      state: stateOf(t),
      isPublished: t.isPublished,
      publishedAt: t.publishedAt,
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy?.email ?? null,
    };
  }
  return { key: p.key, slug: p.slug, versions };
}

export type PageSaveInput = {
  key: string;
  locale: Locale;
  /** updatedAt of the version the editor loaded; null when it did not exist. */
  expectedUpdatedAt: string | null;
  intent: "save" | "publish" | "unpublish";
  title: string;
  body: unknown;
  seoTitle: string;
  metaDescription: string;
};

export type PageErrors = Partial<Record<"title" | "body" | "seoTitle" | "metaDescription", string>>;
export type PageSaveResult = { ok: true; slug: string } | { ok: false; message: string; errors: PageErrors; placeholders?: string[] };

export async function savePage(input: PageSaveInput, adminId: string, now: Date): Promise<PageSaveResult> {
  if (!(locales as readonly string[]).includes(input.locale)) return { ok: false, message: "Unknown language.", errors: {} };
  const page = await db.staticPage.findUnique({ where: { key: input.key }, select: { id: true, slug: true, translations: { where: { locale: input.locale }, select: { id: true, updatedAt: true } } } });
  if (!page) return { ok: false, message: "That page does not exist.", errors: {} };
  const current = page.translations[0] ?? null;

  const title = input.title.replace(/\s+/g, " ").trim();
  const seoTitle = input.seoTitle.replace(/\s+/g, " ").trim();
  const metaDescription = input.metaDescription.replace(/\s+/g, " ").trim();
  const body = cleanBody(input.body, { align: true });

  const errors: PageErrors = {};
  if (title.length > PAGE_LIMITS.title) errors.title = `Keep the title under ${PAGE_LIMITS.title} characters.`;
  if (seoTitle.length > PAGE_LIMITS.seoTitle) errors.seoTitle = `Keep the search title under ${PAGE_LIMITS.seoTitle} characters.`;
  if (metaDescription.length > PAGE_LIMITS.metaDescription) errors.metaDescription = `Keep the description under ${PAGE_LIMITS.metaDescription} characters.`;
  if (!body) errors.body = "The page text could not be read. Reload the page and try again.";
  else if (JSON.stringify(body).length > MAX_BODY_CHARS) errors.body = "The page text is too long.";

  if (input.intent === "publish") {
    if (!title) errors.title = "Enter a title before publishing.";
    if (body && wordCount(body) === 0) errors.body = "Write the page text before publishing.";
  }
  if (Object.keys(errors).length) return { ok: false, message: "Nothing was saved. Fix the highlighted fields.", errors };

  // Placeholders block publishing, so that "[[email address]]" can never go live.
  if (input.intent === "publish") {
    const left = findPlaceholders(title, bodyText(body!), seoTitle, metaDescription);
    if (left.length) {
      return {
        ok: false,
        message: `Not published: ${left.length} placeholder${left.length === 1 ? "" : "s"} still to complete (text in [[double brackets]]). Fill them in or delete them, then publish. Your changes were not saved; use Save draft to keep them.`,
        errors: {},
        placeholders: left.slice(0, 10),
      };
    }
  }

  // Never overwrite changes made since the editor loaded the page (another tab or browser).
  const expected = input.expectedUpdatedAt;
  if ((current ? current.updatedAt.toISOString() : null) !== expected) {
    return { ok: false, message: "Nothing was saved. This page was changed somewhere else after you opened it. Copy your text, reload the page and apply your changes again.", errors: {} };
  }

  const draft = { title, body: body as unknown as Prisma.InputJsonValue, seoTitle, metaDescription, updatedById: adminId };
  const published =
    input.intent === "publish"
      ? { publishedTitle: title, publishedBody: body as unknown as Prisma.InputJsonValue, publishedSeoTitle: seoTitle, publishedMetaDescription: metaDescription, isPublished: true, publishedAt: now }
      : input.intent === "unpublish"
        ? { isPublished: false }
        : {};

  if (current) {
    // The updatedAt condition makes the check and the write one step, so two saves cannot both pass the check.
    const r = await db.staticPageTranslation.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: { ...draft, ...published, updatedAt: now } });
    if (r.count === 0) return { ok: false, message: "Nothing was saved. This page was changed somewhere else at the same moment. Reload and try again.", errors: {} };
  } else {
    await db.staticPageTranslation.create({ data: { pageId: page.id, locale: input.locale, ...draft, ...published, updatedAt: now } });
  }
  return { ok: true, slug: page.slug };
}

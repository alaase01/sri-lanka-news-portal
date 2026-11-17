import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { authorOptions, categoryOptions, getArticleForEdit, LIMITS, tagOptions } from "@/server/admin/articles";
import { binArticleAction, restoreRevisionAction } from "@/server/admin/article-actions";
import { getMediaItems, listMedia } from "@/server/media/core";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import type { PickerImage } from "@/components/admin/MediaPicker";
import { LocaleText, Notice, StatusBadge, buttonDanger } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Edit article" };
export const instant = false;

type Params = Promise<{ id: string; locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Request time. Admin pages render per request, after the session check. */
function requestTime(): string {
  return new Date().toISOString();
}

const LOCALE_NAME = { si: "Sinhala", en: "English" } as const;

export default async function EditArticlePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireAdmin();
  const { id, locale } = await params;
  const sp = await searchParams;
  if (locale !== "si" && locale !== "en") notFound();
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();

  const article = await getArticleForEdit(id);
  if (!article) notFound();
  const other = locale === "si" ? "en" : "si";
  const t = article.translations[locale] ?? null;
  const o = article.translations[other] ?? null;

  const [categories, tags, authors, recent, featured] = await Promise.all([
    categoryOptions(),
    tagOptions(),
    authorOptions(),
    listMedia({ take: 30 }),
    getMediaItems(article.featuredMediaId ? [article.featuredMediaId] : []),
  ]);
  const toPicker = (m: (typeof recent.items)[number]): PickerImage => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, alt: m.altEn || m.altSi });
  const images = [...featured.map(toPicker), ...recent.items.filter((m) => m.id !== article.featuredMediaId).map(toPicker)];

  const restored = typeof sp.restored === "string" ? sp.restored.slice(0, 40) : "";

  if (article.deletedAt) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <Link href="/admin/articles?bin=1" className="text-sm font-semibold text-navy hover:underline">← Bin</Link>
        <Notice tone="error">This article is in the bin. Restore it from the bin to edit it.</Notice>
      </div>
    );
  }

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/articles" className="text-sm font-semibold text-navy hover:underline">← Articles</Link>
        {/* A full page load, so the editor's unsaved-changes warning can fire. */}
        <a href={`/admin/ai?article=${article.id}`} className="text-sm font-semibold text-navy hover:underline">Open in the AI Editorial Assistant</a>
      </div>

      <nav aria-label="Language versions" className="flex flex-wrap gap-2 border-b border-line">
        {(["si", "en"] as const).map((l) => {
          const tr = article.translations[l];
          const active = l === locale;
          return (
            // A full page load, so the unsaved-changes warning can fire.
            <a
              key={l}
              href={`/admin/articles/${article.id}/${l}`}
              aria-current={active ? "page" : undefined}
              className={"-mb-px flex items-center gap-2 rounded-t border px-4 py-2 font-semibold " + (active ? "border-line border-b-surface bg-surface text-ink" : "border-transparent text-navy hover:underline")}
            >
              {LOCALE_NAME[l]} <StatusBadge status={tr?.status} />
            </a>
          );
        })}
      </nav>

      {restored && <Notice>The earlier version was restored. Review it, then save or publish as needed.</Notice>}

      <ArticleEditor
        key={`${article.id}-${locale}-${restored}`}
        articleId={article.id}
        now={requestTime()}
        locale={locale}
        publicHref={t ? `/${locale}/${t.slug}` : null}
        otherSlug={o && !t ? o.slug : null}
        shared={{
          primaryCategoryId: article.primaryCategoryId,
          categoryIds: article.categoryIds,
          tagIds: article.tagIds,
          authorId: article.authorId,
          featuredMediaId: article.featuredMediaId,
        }}
        translation={
          t
            ? {
                headline: t.headline,
                summary: t.summary,
                body: t.body,
                slug: t.slug,
                seoTitle: t.seoTitle,
                metaDescription: t.metaDescription,
                status: t.status,
                scheduledAt: t.scheduledAt?.toISOString() ?? null,
                publishedAt: t.publishedAt?.toISOString() ?? null,
                updatedAt: t.updatedAt.toISOString(),
              }
            : null
        }
        options={{ categories, tags, authors }}
        images={images}
        limits={LIMITS}
      />

      {o && !t && (
        <section className="rounded-lg bg-white p-4">
          <h2 className="font-bold">The {LOCALE_NAME[other]} version, for reference</h2>
          <p className="mt-2 text-lg font-semibold"><LocaleText locale={other}>{o.headline}</LocaleText></p>
          {o.summary && <p className="mt-1 text-body"><LocaleText locale={other}>{o.summary}</LocaleText></p>}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {t && t.revisions.length > 0 && (
          <section className="rounded-lg bg-white p-4" aria-labelledby="history-heading">
            <h2 id="history-heading" className="font-bold">History of the {LOCALE_NAME[locale]} version</h2>
            <p className="mt-1 text-sm text-muted">A copy is kept every time you save. Restoring copies the headline, summary and text back; status and settings stay as they are.</p>
            <ol className="mt-3 flex flex-col divide-y divide-line">
              {t.revisions.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {formatDateTime(r.createdAt.toISOString(), "en")}
                      {r.note && !r.note.startsWith("Restored") ? ` · ${r.note}` : ""}
                      {r.note?.startsWith("Restored") ? " · Restored an earlier version" : ""}
                      {i === 0 ? " · current" : ""}
                    </p>
                    <p className="truncate text-muted"><LocaleText locale={locale}>{r.headline}</LocaleText></p>
                  </div>
                  {i > 0 && (
                    <form action={restoreRevisionAction}>
                      <input type="hidden" name="revisionId" value={r.id} />
                      <button type="submit" className="min-h-9 rounded border border-navy px-3 font-semibold text-navy hover:bg-soft">Restore</button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-lg bg-white p-4" aria-labelledby="bin-heading">
          <h2 id="bin-heading" className="font-bold">Move to bin</h2>
          <p className="mt-1 text-sm text-muted">Removes both language versions from the site at once. Nothing is erased; you can restore it from the bin.</p>
          <form action={binArticleAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="articleId" value={article.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required /> Yes, remove this article from the site
            </label>
            <button type="submit" className={buttonDanger}>Move to bin</button>
          </form>
        </section>
      </div>
    </div>
  );
}

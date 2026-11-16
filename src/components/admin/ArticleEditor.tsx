"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveArticleAction, type SaveArticleState } from "@/server/admin/article-actions";
import type { BodyDoc } from "@/lib/content/body";
import { slugify } from "@/lib/content/slug";
import { formatDateTime, toColomboInput } from "@/lib/utils/dates";
import { RichTextEditor } from "./RichTextEditor";
import { MediaPicker, type PickerImage } from "./MediaPicker";
import { StatusBadge, buttonPrimary, buttonSecondary, inputClass } from "./ui";

type Option = { id: string; label: string };

export type EditorProps = {
  articleId: string;
  /** Server time when the page was rendered. */
  now: string;
  locale: "si" | "en";
  /** Address of the live page, when readers can see this version. */
  publicHref: string | null;
  otherSlug: string | null;
  shared: { primaryCategoryId: string; categoryIds: string[]; tagIds: string[]; authorId: string | null; featuredMediaId: string | null };
  translation: {
    headline: string;
    summary: string;
    body: BodyDoc;
    slug: string;
    seoTitle: string;
    metaDescription: string;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    updatedAt: string;
  } | null;
  options: { categories: Option[]; tags: Option[]; authors: Option[] };
  images: PickerImage[];
  limits: { headline: number; summary: number; seoTitle: number; metaDescription: number };
};

const LOCALE_NAME = { si: "Sinhala", en: "English" } as const;

export function ArticleEditor(p: EditorProps) {
  const t = p.translation;
  const initialState: SaveArticleState = { ok: null, message: "", errors: {}, updatedAt: t?.updatedAt ?? null, status: t?.status ?? null, seq: 0 };
  const [state, action, pending] = useActionState(saveArticleAction, initialState);

  // Every field is controlled: React 19 resets uncontrolled forms after an action.
  const [headline, setHeadline] = useState(t?.headline ?? "");
  const [summary, setSummary] = useState(t?.summary ?? "");
  const [body, setBody] = useState<BodyDoc>(t?.body ?? { type: "doc", content: [{ type: "paragraph" }] });
  const [slug, setSlug] = useState(t?.slug ?? p.otherSlug ?? "");
  const [seoTitle, setSeoTitle] = useState(t?.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(t?.metaDescription ?? "");
  const [scheduledAt, setScheduledAt] = useState(t?.scheduledAt ? toColomboInput(new Date(t.scheduledAt)) : "");
  const [primaryCategoryId, setPrimaryCategoryId] = useState(p.shared.primaryCategoryId);
  const [categoryIds, setCategoryIds] = useState<string[]>(p.shared.categoryIds);
  const [tagIds, setTagIds] = useState<string[]>(p.shared.tagIds);
  const [authorId, setAuthorId] = useState(p.shared.authorId ?? "");
  const [featuredMediaId, setFeaturedMediaId] = useState(p.shared.featuredMediaId ?? "");
  const [tagFilter, setTagFilter] = useState("");
  const [editedAtSeq, setEditedAtSeq] = useState<number | null>(null);

  const status = state.status;
  const exists = state.updatedAt !== null;
  const dirty = editedAtSeq !== null && editedAtSeq >= state.seq;
  const e = state.errors;
  const edited = () => setEditedAtSeq(state.seq);
  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    edited();
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const scheduledFuture = status === "SCHEDULED" && t?.scheduledAt && new Date(t.scheduledAt).getTime() > new Date(p.now).getTime();
  const isLive = status === "PUBLISHED" || (status === "SCHEDULED" && !scheduledFuture);
  const shownTags = useMemo(() => {
    const f = tagFilter.trim().toLowerCase();
    const selected = p.options.tags.filter((x) => tagIds.includes(x.id));
    const rest = p.options.tags.filter((x) => !tagIds.includes(x.id) && (!f || x.label.toLowerCase().includes(f)));
    return [...selected, ...rest.slice(0, 40)];
  }, [tagFilter, tagIds, p.options.tags]);

  const fontClass = p.locale === "si" ? " font-sans" : "";
  const err = (key: string) => (e[key] ? <span id={`${key}-error`} className="mt-1 block text-sm font-normal text-brand-dark">{e[key]}</span> : null);
  const counter = (value: string, max: number, hint?: string) => (
    <span className={"mt-1 block text-xs font-normal " + (value.length > max ? "text-brand-dark" : "text-muted")}>
      {value.length}/{max}
      {hint ? ` · ${hint}` : ""}
    </span>
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="articleId" value={p.articleId} />
      <input type="hidden" name="locale" value={p.locale} />
      <input type="hidden" name="expectedUpdatedAt" value={state.updatedAt ?? ""} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <input type="hidden" name="featuredMediaId" value={featuredMediaId} />
      {categoryIds.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}
      {tagIds.map((id) => <input key={id} type="hidden" name="tagIds" value={id} />)}

      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={"rounded px-4 py-3 font-semibold " + (state.ok ? "bg-[#e1f4e8] text-[#14532d]" : "bg-[#fdecee] text-brand-dark")}>
          {state.message}
        </p>
      )}
      {!exists && (
        <p className="rounded bg-notice px-4 py-3 text-notice-ink">
          There is no {LOCALE_NAME[p.locale]} version yet. Write it here; saving creates it as a draft. Category, tags and image are shared with the other language.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Text of this language version ── */}
        <div className="flex min-w-0 flex-col gap-5">
          <label className="font-semibold">
            Headline
            <input
              name="headline"
              value={headline}
              onChange={(ev) => set(setHeadline)(ev.target.value)}
              lang={p.locale}
              aria-invalid={!!e.headline}
              aria-describedby={e.headline ? "headline-error" : undefined}
              className={inputClass + " text-xl font-bold" + fontClass}
            />
            {err("headline")}
          </label>

          <label className="font-semibold">
            Summary <span className="font-normal text-muted">(shown under the headline and in listings)</span>
            <textarea
              name="summary"
              value={summary}
              onChange={(ev) => set(setSummary)(ev.target.value)}
              rows={3}
              lang={p.locale}
              aria-invalid={!!e.summary}
              className={inputClass + " font-normal" + fontClass}
            />
            {counter(summary, p.limits.summary)}
            {err("summary")}
          </label>

          <div>
            <p className="mb-1 font-semibold" id="body-label">Article text</p>
            <RichTextEditor initial={body} locale={p.locale} onChange={set(setBody)} invalid={!!e.body} describedBy={e.body ? "body-error" : undefined} />
            {err("body")}
          </div>

          <details className="rounded-lg bg-white p-4" open={!!(e.slug || e.seoTitle || e.metaDescription) || !exists}>
            <summary className="cursor-pointer font-bold">Web address and search engines</summary>
            <div className="mt-4 flex flex-col gap-4">
              <label className="font-semibold">
                Web address (slug)
                <div className="flex flex-wrap gap-2">
                  <input
                    name="slug"
                    value={slug}
                    onChange={(ev) => set(setSlug)(ev.target.value.toLowerCase())}
                    maxLength={120}
                    aria-invalid={!!e.slug}
                    aria-describedby="slug-help"
                    className={inputClass + " min-w-0 flex-1 font-normal"}
                  />
                  {p.locale === "en" && (
                    <button type="button" className={buttonSecondary + " mt-1"} onClick={() => set(setSlug)(slugify(headline))}>
                      From headline
                    </button>
                  )}
                </div>
                <span id="slug-help" className={"mt-1 block text-sm font-normal " + (e.slug ? "text-brand-dark" : "text-muted")}>
                  {e.slug ?? `English letters, numbers and hyphens. Changing it after publishing is safe: the old address redirects to the new one.`}
                </span>
              </label>
              <label className="font-semibold">
                Search result title <span className="font-normal text-muted">(optional; the headline is used when empty)</span>
                <input name="seoTitle" value={seoTitle} onChange={(ev) => set(setSeoTitle)(ev.target.value)} lang={p.locale} aria-invalid={!!e.seoTitle} className={inputClass + " font-normal" + fontClass} />
                {counter(seoTitle, p.limits.seoTitle, "about 60 characters show in Google")}
                {err("seoTitle")}
              </label>
              <label className="font-semibold">
                Search result description <span className="font-normal text-muted">(optional; the summary is used when empty)</span>
                <textarea name="metaDescription" value={metaDescription} onChange={(ev) => set(setMetaDescription)(ev.target.value)} rows={2} lang={p.locale} aria-invalid={!!e.metaDescription} className={inputClass + " font-normal" + fontClass} />
                {counter(metaDescription, p.limits.metaDescription, "about 155 characters show in Google")}
                {err("metaDescription")}
              </label>
            </div>
          </details>
        </div>

        {/* ── Publishing and shared settings ── */}
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg bg-white p-4" aria-labelledby="publish-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="publish-heading" className="font-bold">{LOCALE_NAME[p.locale]} version</h2>
              <StatusBadge status={status} />
            </div>
            {status === "SCHEDULED" && t?.scheduledAt && (
              <p className="text-sm text-body">{scheduledFuture ? "Goes live" : "Went live"} {formatDateTime(t.scheduledAt, "en")} (Sri Lanka time)</p>
            )}
            {status === "PUBLISHED" && t?.publishedAt && <p className="text-sm text-body">Published {formatDateTime(t.publishedAt, "en")}</p>}
            {isLive && p.publicHref && (
              <a href={p.publicHref} target="_blank" rel="noopener" className="text-sm font-semibold text-navy hover:underline">View on the site ↗</a>
            )}
            {isLive && <p className="text-sm text-muted">This version is live. Saving changes updates the site within a minute.</p>}
            {dirty && <p className="text-sm font-semibold text-notice-ink">You have unsaved changes.</p>}

            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="save" disabled={pending} className={isLive ? buttonPrimary : buttonSecondary}>
                {pending ? "Saving…" : isLive ? "Save changes" : "Save draft"}
              </button>
              {!isLive && (
                <button type="submit" name="intent" value="publish" disabled={pending} className={buttonPrimary}>
                  Publish now
                </button>
              )}
            </div>

            {!isLive && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <label htmlFor="scheduledAt" className="text-sm font-semibold">Or publish later (Sri Lanka time)</label>
                <input
                  id="scheduledAt"
                  name="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(ev) => set(setScheduledAt)(ev.target.value)}
                  aria-invalid={!!e.scheduledAt}
                  aria-describedby={e.scheduledAt ? "scheduledAt-error" : undefined}
                  className={inputClass + " mt-0"}
                />
                {err("scheduledAt")}
                <button type="submit" name="intent" value="schedule" disabled={pending} className={buttonSecondary}>
                  {scheduledFuture ? "Change schedule" : "Schedule"}
                </button>
              </div>
            )}

            {(isLive || scheduledFuture) && (
              <div className="border-t border-line pt-3">
                <button type="submit" name="intent" value="unpublish" disabled={pending} className="text-sm font-semibold text-brand-dark hover:underline">
                  {scheduledFuture ? "Cancel the schedule (back to draft)" : "Unpublish (remove from the site)"}
                </button>
              </div>
            )}
          </section>

          <p className="px-1 text-xs text-muted">The settings below are shared by the Sinhala and English versions.</p>

          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <label className="text-sm font-semibold">
              Main category
              <select name="primaryCategoryId" value={primaryCategoryId} onChange={(ev) => set(setPrimaryCategoryId)(ev.target.value)} aria-invalid={!!e.primaryCategoryId} className={inputClass + " font-normal"}>
                {p.options.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {err("primaryCategoryId")}
            </label>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Also show in other categories ({categoryIds.length})</summary>
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {p.options.categories.filter((c) => c.id !== primaryCategoryId).map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={categoryIds.includes(c.id)}
                        onChange={(ev) => set(setCategoryIds)(ev.target.checked ? [...categoryIds, c.id] : categoryIds.filter((x) => x !== c.id))}
                      />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
            {err("categories")}
          </section>

          <section className="flex flex-col gap-2 rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold">Tags ({tagIds.length})</h2>
            <input value={tagFilter} onChange={(ev) => setTagFilter(ev.target.value)} placeholder="Find a tag…" aria-label="Find a tag" className={inputClass + " mt-0 font-sans text-sm"} />
            <ul className="max-h-56 overflow-y-auto">
              {shownTags.map((tag) => (
                <li key={tag.id}>
                  <label className="flex items-start gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={tagIds.includes(tag.id)}
                      onChange={(ev) => set(setTagIds)(ev.target.checked ? [...tagIds, tag.id] : tagIds.filter((x) => x !== tag.id))}
                    />
                    <span className="font-sans">{tag.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {/* A new tab, so the article being edited stays open. Reload this page afterwards to see new tags. */}
            <a href="/admin/tags" target="_blank" rel="noopener" className="text-xs font-semibold text-navy hover:underline">Add or edit tags ↗</a>
            {err("tags")}
          </section>

          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold">Featured image</h2>
            <MediaPicker images={p.images} value={featuredMediaId} onChange={set(setFeaturedMediaId)} />
            {err("featuredMediaId")}
          </section>

          {p.options.authors.length > 0 && (
            <section className="rounded-lg bg-white p-4">
              <label className="text-sm font-semibold">
                Author
                <select name="authorId" value={authorId} onChange={(ev) => set(setAuthorId)(ev.target.value)} className={inputClass + " font-normal"}>
                  <option value="">None</option>
                  {p.options.authors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              {err("authorId")}
            </section>
          )}
          {p.options.authors.length === 0 && <input type="hidden" name="authorId" value="" />}
        </aside>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { bodyText, emptyBody, wordCount, type BodyDoc } from "@/lib/content/body";
import { formatDateTime } from "@/lib/utils/dates";
import type { PageErrors, PageVersionState } from "@/server/admin/pages";
import { savePageAction } from "@/server/admin/page-actions";
import { StaticPageContent } from "@/components/pages/StaticPageContent";
import { RichTextEditor } from "./RichTextEditor";
import { LOCALE_NAME, Notice, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "./ui";

type Initial = {
  title: string;
  body: BodyDoc;
  seoTitle: string;
  metaDescription: string;
  state: PageVersionState;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
} | null;

type Props = {
  pageKey: string;
  slug: string;
  locale: Locale;
  limits: { title: number; seoTitle: number; metaDescription: number };
  initial: Initial;
  otherLanguageTitle: string;
  done?: string;
};

const PLACEHOLDER = /\[\[[\s\S]*?\]\]/g;

const DONE_MESSAGE: Record<string, string> = {
  save: "Draft saved. The live page has not changed.",
  publish: "Published. This version is now on the site.",
  unpublish: "Unpublished. This language version is no longer on the site.",
};

export function PageEditor({ pageKey, slug, locale, limits, initial, otherLanguageTitle, done }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState<BodyDoc>(initial?.body ?? emptyBody());
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? "");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish">(null);
  const sending = useRef(false);
  // The confirmation from the previous save arrives in the address (?done=…).
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(done && DONE_MESSAGE[done] ? { tone: "ok", text: DONE_MESSAGE[done] } : null);
  const [errors, setErrors] = useState<PageErrors>({});
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const placeholders = [title, bodyText(body), seoTitle, metaDescription].flatMap((t) => t.match(PLACEHOLDER) ?? []);
  const words = wordCount(body);
  const notWritten = !title.trim() && words === 0;
  const live = initial?.isPublished ?? false;

  async function submit(intent: "save" | "publish" | "unpublish") {
    if (sending.current) return;
    if (intent === "publish" && !window.confirm(`Publish the ${LOCALE_NAME[locale]} version? It will replace what visitors currently see.`)) return;
    if (intent === "unpublish" && !window.confirm(`Take the ${LOCALE_NAME[locale]} version off the site? Visitors will no longer see it, and its footer link will disappear.`)) return;
    sending.current = true;
    setBusy(intent);
    setMessage(null);
    setErrors({});
    setBlockers([]);
    try {
      const r = await savePageAction(
        JSON.stringify({ key: pageKey, locale, expectedUpdatedAt: initial?.updatedAt ?? null, intent, title, body, seoTitle, metaDescription }),
      );
      if (!r.ok) {
        setMessage({ tone: "error", text: r.message });
        setErrors(r.errors);
        setBlockers(r.placeholders ?? []);
        return;
      }
      setDirty(false);
      // Reload the saved version from the server (new "last updated" and state).
      router.replace(`/admin/pages/${pageKey}?lang=${locale}&done=${intent}`);
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "The server could not be reached, so nothing was saved. Check your connection and try again." });
    } finally {
      sending.current = false;
      setBusy(null);
    }
  }

  const count = (v: string, max: number) => (
    <span className={`text-xs ${v.length > max ? "font-bold text-brand-dark" : "text-muted"}`}>
      {v.length} / {max}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 text-sm">
        <div className="flex flex-col gap-1">
          <span>
            Web address: <strong>/{locale}/{slug}</strong>
            {live && (
              <>
                {" "}·{" "}
                <a href={`/${locale}/${slug}`} target="_blank" rel="noopener" className="font-semibold text-navy underline">
                  View live page
                </a>
              </>
            )}
          </span>
          {initial && (
            <span className="text-muted">
              Last updated {formatDateTime(initial.updatedAt, "en")}
              {initial.updatedBy ? ` by ${initial.updatedBy}` : ""}
              {initial.publishedAt && ` · last published ${formatDateTime(initial.publishedAt, "en")}`}
            </span>
          )}
        </div>
        {placeholders.length > 0 ? (
          <span className="rounded bg-notice px-3 py-1 font-semibold text-notice-ink">{placeholders.length} placeholder{placeholders.length === 1 ? "" : "s"} to complete before publishing</span>
        ) : (
          <span className="rounded bg-[#e3f3e8] px-3 py-1 font-semibold text-[#1d5b33]">No placeholders left</span>
        )}
      </div>

      {notWritten && (
        <Notice tone="error">
          The {LOCALE_NAME[locale]} version has not been written yet.
          {otherLanguageTitle && <> The other language version is titled “{otherLanguageTitle}”.</>} Write this version separately; it is not copied from the other language.
        </Notice>
      )}
      {initial?.state === "changed" && <Notice>This page is published, and the draft below has changes that are not on the site yet. Publish to update the live page.</Notice>}

      <div role="tablist" aria-label="View" className="flex gap-2">
        {(["edit", "preview"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={tab === t ? buttonPrimary : buttonSecondary}>
            {t === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      {tab === "edit" ? (
        <section className="flex flex-col gap-4 rounded-lg bg-white p-4" aria-label={`${LOCALE_NAME[locale]} content`}>
          <label className="text-sm font-semibold">
            Title
            <input
              value={title}
              onChange={(e) => change(setTitle)(e.target.value)}
              lang={locale}
              aria-invalid={!!errors.title}
              className={inputClass + " text-lg font-bold font-sans"}
            />
            {count(title, limits.title)}
            {errors.title && <span className="block text-sm text-brand-dark">{errors.title}</span>}
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold" id="page-body-label">Page text</span>
            <RichTextEditor initial={body} locale={locale} onChange={change(setBody)} invalid={!!errors.body} describedBy="page-body-help" allowAlign label="Page text" />
            <span id="page-body-help" className="text-xs text-muted">{words.toLocaleString("en")} words. Links may go to https:// addresses, mailto: emails or pages on this site (/si/… or /en/…).</span>
            {errors.body && <span className="text-sm text-brand-dark">{errors.body}</span>}
          </div>
          <fieldset className="flex flex-col gap-3 rounded border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Search engines and sharing</legend>
            <label className="text-sm font-semibold">
              Search title <span className="font-normal text-muted">(optional; the page title is used when empty)</span>
              <input value={seoTitle} onChange={(e) => change(setSeoTitle)(e.target.value)} lang={locale} aria-invalid={!!errors.seoTitle} className={inputClass + " font-sans"} />
              {count(seoTitle, limits.seoTitle)}
              {errors.seoTitle && <span className="block text-sm text-brand-dark">{errors.seoTitle}</span>}
            </label>
            <label className="text-sm font-semibold">
              Description <span className="font-normal text-muted">(shown in search results; about 150 characters)</span>
              <textarea value={metaDescription} onChange={(e) => change(setMetaDescription)(e.target.value)} rows={2} lang={locale} aria-invalid={!!errors.metaDescription} className={inputClass + " font-sans"} />
              {count(metaDescription, limits.metaDescription)}
              {errors.metaDescription && <span className="block text-sm text-brand-dark">{errors.metaDescription}</span>}
            </label>
          </fieldset>
        </section>
      ) : (
        <section aria-label="Preview" className="flex flex-col gap-2">
          <p className="rounded bg-notice px-3 py-2 text-sm text-notice-ink">
            Preview of the text below, including unsaved changes. {live ? "The live page still shows the last published version." : "This version is not on the site."}
          </p>
          <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-lg bg-white px-4 py-6 sm:px-8 sm:py-8">
            <StaticPageContent title={title || "(no title)"} body={body} locale={locale} />
          </article>
        </section>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && <Notice tone={message.tone === "error" ? "error" : undefined}>{message.text}</Notice>}
        {blockers.length > 0 && (
          <ul className="mt-2 list-disc pl-6 text-sm">
            {blockers.map((b, i) => (
              <li key={i} lang={locale}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3 shadow-sm">
        <button type="button" onClick={() => submit("save")} disabled={!!busy} className={buttonSecondary}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={() => submit("publish")} disabled={!!busy} className={buttonPrimary}>
          {busy === "publish" ? "Publishing…" : live ? "Publish changes" : "Publish"}
        </button>
        {live && (
          <button type="button" onClick={() => submit("unpublish")} disabled={!!busy} className={buttonDanger}>
            {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
          </button>
        )}
        <span className="text-sm text-muted">{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <Link href="/admin/pages" className="ml-auto text-sm font-semibold text-navy hover:underline">Back to all pages</Link>
      </div>

    </div>
  );
}

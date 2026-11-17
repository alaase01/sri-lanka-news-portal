"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { wordCount, type BodyDoc } from "@/lib/content/body";
import { bodyToPlainText } from "@/lib/content/markdown";
import { slugify } from "@/lib/content/slug";
import { OPERATIONS, OPERATION_LABEL, STYLES, STYLE_LABEL, operationInfo, requiredSourceLocale, type Operation, type Style } from "@/lib/ai/options";
import type { AiSelectedArticle, GenerateResult, SaveTarget } from "@/server/ai/assistant";
import type { FieldErrors } from "@/server/admin/articles";
import { approveAction, generateAction } from "@/server/ai/actions";
import { ArticleBody } from "@/components/article/ArticleBody";
import { RichTextEditor } from "./RichTextEditor";
import { LOCALE_NAME, LocaleText, Notice, StatusBadge, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "./ui";

type Props = {
  mode: "article" | "paste";
  article: AiSelectedArticle | null;
  categories: { id: string; label: string }[];
  configured: boolean;
  limits: { sourceChars: number; headline: number; instructions: number; links: number; hourly: number; daily: number };
  usage: { lastHour: number; lastDay: number };
};

function Spinner() {
  return <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent align-[-2px]" />;
}

function describeTarget(t: SaveTarget): string {
  const lang = LOCALE_NAME[t.locale];
  switch (t.kind) {
    case "update":
      return `This will update the ${t.status === "HIDDEN" ? "unpublished" : "draft"} ${lang} version “${t.headline}”. Its current text is kept in the article's history, so you can restore it.`;
    case "suggestion":
      return `The ${lang} version “${t.headline}” is ${t.status === "SCHEDULED" ? "scheduled" : "published"}, so it will NOT be changed. The text is stored as an “AI suggestion” in the article's history. To use it, open the article and choose Restore on that suggestion.`;
    case "newTranslation":
      return `This article has no ${lang} version yet. This will create one as a draft. It will not appear on the site until you publish it.`;
    case "newArticle":
      return `This will create a new ${lang} draft article. It will not appear on the site until you publish it.`;
  }
}

export function AiAssistant({ mode, article, categories, configured, limits, usage }: Props) {
  const available = article ? (["si", "en"] as const).filter((l) => article.versions[l]) : (["si", "en"] as const);
  const [sourceLocale, setSourceLocale] = useState<Locale>(available[0] ?? "si");
  const [pasteHeadline, setPasteHeadline] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [operation, setOperation] = useState<Operation>("rewrite");
  const [style, setStyle] = useState<Style>("professional");
  const [instructions, setInstructions] = useState("");
  const [linksText, setLinksText] = useState("");

  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState<BodyDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [mobileTab, setMobileTab] = useState<"original" | "suggestion">("suggestion");
  const [copied, setCopied] = useState(false);
  const [requestsHour, setRequestsHour] = useState(usage.lastHour);

  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saved, setSaved] = useState<{ message: string; href: string } | null>(null);

  // Generated text is only in this page. Warn before leaving so it is not lost by accident.
  useEffect(() => {
    if (!result) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [result]);

  const source = article?.versions[sourceLocale];
  const operations = OPERATIONS.filter((op) => {
    const req = requiredSourceLocale(op);
    return !req || req === sourceLocale;
  });
  const op = operations.includes(operation) ? operation : "rewrite";
  const info = operationInfo(op, sourceLocale);
  const links = linksText.split("\n").map((l) => l.trim()).filter(Boolean);
  const pasteWords = pasteText.trim() ? pasteText.trim().split(/\s+/).length : 0;

  async function runGenerate() {
    if (busy.current) return;
    if (result && dirty && !window.confirm("Replace your edited suggestion with a new one?")) return;
    setError(null);
    setSaved(null);
    if (mode === "paste" && info.needsBody && !pasteText.trim()) return setError("Paste the article text first.");
    if (mode === "paste" && info.headlinesOnly && !pasteHeadline.trim() && !pasteText.trim()) return setError("Enter a headline or article text first.");
    if (links.length > limits.links) return setError(`Add at most ${limits.links} source links.`);
    busy.current = true;
    setPending(true);
    try {
      const r = await generateAction(
        JSON.stringify({
          mode,
          articleId: article?.id ?? null,
          sourceLocale,
          headline: mode === "paste" ? pasteHeadline : "",
          text: mode === "paste" ? pasteText : "",
          operation: op,
          style: op === "rewrite" ? style : null,
          instructions,
          sourceLinks: links,
        }),
      );
      if (!r.ok) {
        setError(r.message);
        if (!["invalid", "busy", "not_found", "not_configured", "limit"].includes(r.code)) setRequestsHour((n) => n + 1);
        return;
      }
      setRequestsHour((n) => n + 1);
      setResult(r.result);
      setEditHeadline(r.result.headline);
      setEditBody(r.result.body);
      setEditing(false);
      setDirty(false);
      setEditorKey((k) => k + 1);
      setMobileTab("suggestion");
      setConfirming(false);
      setSaveError(null);
      setFieldErrors({});
      setSlug("");
    } catch {
      setError("The server could not be reached. Check your internet connection and try again. Nothing was saved.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function discard() {
    if (dirty && !window.confirm("Discard the suggestion and your edits? Nothing has been saved.")) return;
    setResult(null);
    setEditBody(null);
    setConfirming(false);
    setError(null);
  }

  async function copy() {
    if (!result) return;
    const text = editBody ? `${editHeadline}\n\n${bodyToPlainText(editBody)}` : editHeadline;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copying is blocked by the browser. Select the text and copy it instead.");
    }
  }

  function openConfirm() {
    if (!result) return;
    setSaveError(null);
    setFieldErrors({});
    const t = result.target;
    if (t.kind === "newTranslation" && !slug) {
      const otherSlug = article?.versions[result.original.locale]?.slug ?? "";
      setSlug(slugify(editHeadline) || otherSlug);
    }
    if (t.kind === "newArticle" && !slug) setSlug(slugify(editHeadline));
    setConfirming(true);
  }

  async function approve() {
    if (!result || saving) return;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    const t = result.target;
    try {
      const r = await approveAction(
        JSON.stringify({
          operation: result.operation,
          mode,
          articleId: article?.id ?? null,
          locale: result.outputLocale,
          expectedUpdatedAt: t.kind === "update" || t.kind === "suggestion" ? t.updatedAt : null,
          headline: editHeadline,
          body: result.body ? editBody : null,
          slug,
          primaryCategoryId: categoryId,
        }),
      );
      if (!r.ok) {
        setSaveError(r.message);
        setFieldErrors(r.errors);
        return;
      }
      setSaved({ message: r.message, href: `/admin/articles/${r.articleId}/${r.locale}` });
      setResult(null);
      setConfirming(false);
      setDirty(false);
    } catch {
      setSaveError("The server could not be reached, so nothing was saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const originalHeadline = mode === "article" ? (source?.headline ?? "") : pasteHeadline;
  const counter = (value: string, max: number) => (
    <span className={`text-xs ${value.length > max ? "font-bold text-brand-dark" : "text-muted"}`}>
      {value.length.toLocaleString("en")} / {max.toLocaleString("en")}
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ───────── input ───────── */}
      <section aria-labelledby="ai-input" className="flex flex-col gap-4 rounded-lg bg-white p-4">
        <h2 id="ai-input" className="text-lg font-bold">1. Text and instructions</h2>

        {article ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <fieldset className="flex flex-wrap items-center gap-3">
                <legend className="sr-only">Language version to work on</legend>
                {available.map((l) => (
                  <label key={l} className="flex items-center gap-2 rounded border border-line px-3 py-2 font-semibold">
                    <input type="radio" name="sourceLocale" checked={sourceLocale === l} onChange={() => setSourceLocale(l)} disabled={pending} />
                    {LOCALE_NAME[l]} <StatusBadge status={article.versions[l]!.status} />
                  </label>
                ))}
              </fieldset>
              <Link href="/admin/ai" className="text-sm font-semibold text-navy hover:underline">Choose another article</Link>
            </div>
            {source && (
              <div className="rounded border border-line bg-soft p-3">
                <p className="font-bold"><LocaleText locale={sourceLocale}>{source.headline}</LocaleText></p>
                <p className="text-sm text-muted">{source.words.toLocaleString("en")} words · <Link className="underline" href={`/admin/articles/${article.id}/${sourceLocale}`}>open in the editor</Link></p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold sm:w-60">
              Language of the text
              <select value={sourceLocale} onChange={(e) => setSourceLocale(e.target.value as Locale)} className={inputClass} disabled={pending}>
                <option value="si">Sinhala</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Headline <span className="font-normal text-muted">(optional for rewrites)</span>
              <input value={pasteHeadline} onChange={(e) => setPasteHeadline(e.target.value)} maxLength={limits.headline} lang={sourceLocale} className={inputClass + " font-sans"} disabled={pending} />
            </label>
            <label className="text-sm font-semibold">
              Article text
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={10} lang={sourceLocale} className={inputClass + " font-sans"} disabled={pending} aria-describedby="paste-count" />
              <span id="paste-count" className="flex justify-between">
                <span className="text-xs text-muted">{pasteWords.toLocaleString("en")} words. Paste plain text; blank lines separate paragraphs.</span>
                {counter(pasteText, limits.sourceChars)}
              </span>
            </label>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">What should the assistant do?</legend>
            {operations.map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input type="radio" name="operation" checked={op === o} onChange={() => setOperation(o)} disabled={pending} />
                {OPERATION_LABEL[o]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-3">
            {op === "rewrite" && (
              <label className="text-sm font-semibold">
                Rewrite style
                <select value={style} onChange={(e) => setStyle(e.target.value as Style)} className={inputClass} disabled={pending}>
                  {STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm font-semibold">
              Editorial instructions <span className="font-normal text-muted">(optional)</span>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={limits.instructions} className={inputClass + " font-sans"} disabled={pending} placeholder="e.g. keep it under 300 words; use “Colombo Municipal Council” in full" />
              {counter(instructions, limits.instructions)}
            </label>
            <label className="text-sm font-semibold">
              Source links <span className="font-normal text-muted">(optional, one per line, up to {limits.links}; given to the assistant as reference text only — it does not open them)</span>
              <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={2} className={inputClass + " font-sans"} disabled={pending} inputMode="url" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runGenerate} disabled={pending || !configured} aria-busy={pending} className={buttonPrimary + " inline-flex items-center gap-2"}>
            {pending && <Spinner />}
            {pending ? "Generating… this can take a minute" : result ? "Generate again" : "Generate suggestion"}
          </button>
          <span className="text-sm text-muted">
            Requests in the last hour: {requestsHour} of {limits.hourly}. Output: {LOCALE_NAME[info.outputLocale]}.
          </span>
        </div>
        <div aria-live="polite">{error && <Notice tone="error">{error}</Notice>}</div>
      </section>

      {saved && (
        <Notice>
          {saved.message} <Link href={saved.href} className="underline">Open it in the article editor</Link>.
        </Notice>
      )}

      {/* ───────── review ───────── */}
      {result && (
        <section aria-labelledby="ai-review" className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ai-review" className="text-lg font-bold">2. Review the suggestion</h2>
            <p className="text-sm text-muted">
              {OPERATION_LABEL[result.operation]} · output {LOCALE_NAME[result.outputLocale]} · {result.model} · {result.usage.inputTokens.toLocaleString("en")} + {result.usage.outputTokens.toLocaleString("en")} tokens
              {result.usage.estimatedCostUsd !== null && <> · about US${result.usage.estimatedCostUsd.toFixed(4)}</>}
            </p>
          </div>
          <p className="rounded bg-notice px-3 py-2 text-sm text-notice-ink">
            AI-generated and <strong>not saved</strong>. Check names, numbers, dates and quotes against the original before approving. The assistant does not verify facts.
            {result.removedLinks > 0 && <> {result.removedLinks} link(s) the assistant added were removed, because it may only keep the article&apos;s own links.</>}
          </p>

          <div role="tablist" aria-label="Show" className="flex gap-2 lg:hidden">
            {(["original", "suggestion"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)} className={mobileTab === t ? buttonPrimary : buttonSecondary}>
                {t === "original" ? "Original" : "AI suggestion"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className={`${mobileTab === "original" ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded border border-line bg-soft p-4 lg:flex`} aria-label="Original">
              <h3 className="text-sm font-bold uppercase text-muted">Original · {LOCALE_NAME[result.original.locale]}</h3>
              <p className="text-lg font-bold"><LocaleText locale={result.original.locale}>{originalHeadline || result.original.headline || "—"}</LocaleText></p>
              <p className="text-xs text-muted">{wordCount(result.original.body).toLocaleString("en")} words · headline {result.original.headline.length} characters</p>
              <div lang={result.original.locale} className="article-body max-h-[70vh] overflow-auto">
                <ArticleBody body={result.original.body} />
              </div>
            </article>

            <article className={`${mobileTab === "suggestion" ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded border-2 border-navy p-4 lg:flex`} aria-label="AI suggestion">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-navy">
                <span className="rounded bg-navy px-2 py-0.5 text-xs text-white">AI suggestion</span> {LOCALE_NAME[result.outputLocale]}
              </h3>
              {result.headlines.length > 1 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">Choose a headline (you can edit it below)</legend>
                  {result.headlines.map((h) => (
                    <label key={h} className="flex items-start gap-2">
                      <input type="radio" name="alt" checked={editHeadline === h} onChange={() => { setEditHeadline(h); setDirty(true); }} className="mt-1" />
                      <LocaleText locale={result.outputLocale}>{h}</LocaleText>
                    </label>
                  ))}
                </fieldset>
              )}
              <label className="text-sm font-semibold">
                Headline
                <textarea
                  value={editHeadline}
                  onChange={(e) => { setEditHeadline(e.target.value.replace(/\n/g, " ")); setDirty(true); }}
                  rows={2}
                  lang={result.outputLocale}
                  aria-invalid={!!fieldErrors.headline}
                  className={inputClass + " text-lg font-bold font-sans"}
                />
                <span className="text-xs text-muted">{editHeadline.length} characters</span>
                {fieldErrors.headline && <span className="block text-sm text-brand-dark">{fieldErrors.headline}</span>}
              </label>
              {editBody && (
                <>
                  <p className="text-xs text-muted">{wordCount(editBody).toLocaleString("en")} words{dirty ? " · edited by you" : ""}</p>
                  {editing ? (
                    <RichTextEditor key={editorKey} initial={editBody} locale={result.outputLocale} onChange={(d) => { setEditBody(d); setDirty(true); }} />
                  ) : (
                    <div lang={result.outputLocale} className="article-body max-h-[70vh] overflow-auto">
                      <ArticleBody body={editBody} />
                    </div>
                  )}
                </>
              )}
              {!editBody && <p className="text-sm text-muted">Only the headline changes; the article text stays as it is.</p>}
            </article>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openConfirm} disabled={saving || pending || (result.target.kind === "newArticle" && !editBody)} className={buttonPrimary}>
              Approve and save…
            </button>
            {editBody && (
              <button type="button" onClick={() => setEditing((e) => !e)} className={buttonSecondary} aria-pressed={editing}>
                {editing ? "Preview" : "Edit text"}
              </button>
            )}
            <button type="button" onClick={runGenerate} disabled={pending || saving} className={buttonSecondary}>Regenerate</button>
            <button type="button" onClick={copy} className={buttonSecondary}>{copied ? "Copied" : "Copy"}</button>
            <button type="button" onClick={discard} disabled={saving} className={buttonDanger}>Discard</button>
          </div>
          {result.target.kind === "newArticle" && !editBody && (
            <p className="text-sm text-muted">Headlines for pasted text cannot be saved on their own. Copy the headline you want.</p>
          )}

          {confirming && (
            <div role="dialog" aria-modal="false" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded border-2 border-navy bg-soft p-4">
              <h3 id="confirm-title" className="font-bold">Approve and save?</h3>
              <p>{describeTarget(result.target)}</p>
              {(result.target.kind === "newTranslation" || result.target.kind === "newArticle") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.target.kind === "newArticle" && (
                    <label className="text-sm font-semibold">
                      Category
                      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass} aria-invalid={!!fieldErrors.primaryCategoryId}>
                        <option value="">Choose…</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      {fieldErrors.primaryCategoryId && <span className="block text-sm text-brand-dark">{fieldErrors.primaryCategoryId}</span>}
                    </label>
                  )}
                  <label className="text-sm font-semibold">
                    Web address (slug)
                    <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={120} className={inputClass} aria-invalid={!!fieldErrors.slug} placeholder="e.g. colombo-port-city-update" />
                    <span className="text-xs font-normal text-muted">Lower-case English letters, numbers and hyphens.</span>
                    {fieldErrors.slug && <span className="block text-sm text-brand-dark">{fieldErrors.slug}</span>}
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={approve} disabled={saving} aria-busy={saving} className={buttonPrimary + " inline-flex items-center gap-2"}>
                  {saving && <Spinner />}
                  {saving ? "Saving…" : "Yes, save"}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={saving} className={buttonSecondary}>Cancel</button>
              </div>
              <div aria-live="polite">{saveError && <Notice tone="error">{saveError}</Notice>}</div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

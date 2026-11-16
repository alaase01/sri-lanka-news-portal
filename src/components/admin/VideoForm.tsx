"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveVideoAction, type VideoFormState } from "@/server/admin/video-actions";
import { slugify } from "@/lib/content/slug";
import { formatDuration, parseYouTubeId, youtubeWatchUrl } from "@/lib/content/youtube";
import { formatDateTime } from "@/lib/utils/dates";
import { MediaPicker, type PickerImage } from "./MediaPicker";
import { StatusBadge, buttonPrimary, buttonSecondary, inputClass } from "./ui";

type Text = { title: string; description: string; slug: string; seoTitle: string; metaDescription: string };
type Option = { id: string; label: string };

export type VideoFormProps = {
  now: string;
  video: {
    id: string | null;
    updatedAt: string | null;
    status: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
    youtubeId: string;
    durationSeconds: number;
    thumbnailMediaId: string | null;
    articleId: string | null;
    categoryId: string | null;
    tagIds: string[];
    isFeatured: boolean;
    si: Text;
    en: Text;
  };
  options: { categories: Option[]; tags: Option[]; articles: Option[] };
  images: PickerImage[];
};

const empty: Text = { title: "", description: "", slug: "", seoTitle: "", metaDescription: "" };

export function VideoForm({ now, video, options, images }: VideoFormProps) {
  const [state, action, pending] = useActionState(saveVideoAction, {
    ok: null,
    message: "",
    errors: {},
    updatedAt: video.updatedAt,
    status: video.status,
    seq: 0,
  } satisfies VideoFormState);
  const [youtube, setYoutube] = useState(video.youtubeId ? youtubeWatchUrl(video.youtubeId) : "");
  const [duration, setDuration] = useState(video.durationSeconds ? formatDuration(video.durationSeconds) : "");
  const [si, setSi] = useState<Text>(video.si ?? empty);
  const [en, setEn] = useState<Text>(video.en ?? empty);
  const [slugTouched, setSlugTouched] = useState({ si: !!video.id, en: !!video.id });
  const [categoryId, setCategoryId] = useState(video.categoryId ?? "");
  const [articleId, setArticleId] = useState(video.articleId ?? "");
  const [tagIds, setTagIds] = useState(video.tagIds);
  const [tagFilter, setTagFilter] = useState("");
  const [isFeatured, setIsFeatured] = useState(video.isFeatured);
  const [thumbnailMediaId, setThumbnailMediaId] = useState(video.thumbnailMediaId ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editedAtSeq, setEditedAtSeq] = useState<number | null>(null);
  const dirty = editedAtSeq !== null && editedAtSeq >= state.seq;
  const touch = () => setEditedAtSeq(state.seq);
  const e = state.errors;
  const status = state.status;
  const youtubeId = parseYouTubeId(youtube);
  const scheduledFuture = status === "SCHEDULED" && !!video.scheduledAt && new Date(video.scheduledAt) > new Date(now);
  const isLive = status === "PUBLISHED" || (status === "SCHEDULED" && !scheduledFuture);

  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const shownTags = useMemo(() => {
    const f = tagFilter.trim().toLowerCase();
    const selected = options.tags.filter((t) => tagIds.includes(t.id));
    const rest = options.tags.filter((t) => !tagIds.includes(t.id) && (!f || t.label.toLowerCase().includes(f)));
    return [...selected, ...rest.slice(0, 40)];
  }, [tagFilter, tagIds, options.tags]);

  const payload = JSON.stringify({
    id: video.id ?? "",
    expectedUpdatedAt: state.updatedAt ?? "",
    youtube,
    duration,
    scheduledAt,
    thumbnailMediaId,
    articleId,
    categoryId,
    tagIds,
    isFeatured,
    si,
    en,
  });

  const err = (key: string) => (e[key] ? <span className="mt-1 block text-sm font-normal text-brand-dark">{e[key]}</span> : null);

  function setText(lang: "si" | "en", key: keyof Text, value: string) {
    touch();
    const cur = lang === "si" ? si : en;
    const next = { ...cur, [key]: key === "slug" ? value.toLowerCase() : value };
    if (key === "slug") setSlugTouched({ ...slugTouched, [lang]: true });
    if (lang === "en" && key === "title") {
      const s = slugify(value);
      if (!slugTouched.en) next.slug = s;
      // Sinhala titles give no Latin slug, so the English one is the suggestion for both.
      if (!slugTouched.si && si.title) setSi({ ...si, slug: s });
    }
    if (lang === "si" && key === "title" && !slugTouched.si && !next.slug && en.slug) next.slug = en.slug;
    if (lang === "si") setSi(next);
    else setEn(next);
  }

  const textFields = (lang: "si" | "en") => {
    const v = lang === "si" ? si : en;
    const font = lang === "si" ? " font-sans" : "";
    return (
      <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4">
        <legend className="px-1 font-bold">{lang === "si" ? "Sinhala" : "English"}</legend>
        <label className="font-semibold">
          Title
          <input value={v.title} onChange={(ev) => setText(lang, "title", ev.target.value)} lang={lang} maxLength={200} aria-invalid={!!e[`${lang}.title`]} className={inputClass + " font-normal" + font} />
          {err(`${lang}.title`)}
        </label>
        <label className="font-semibold">
          Web address (slug)
          <input value={v.slug} onChange={(ev) => setText(lang, "slug", ev.target.value)} maxLength={120} aria-invalid={!!e[`${lang}.slug`]} className={inputClass + " font-normal"} />
          <span className={"mt-1 block text-sm font-normal " + (e[`${lang}.slug`] ? "text-brand-dark" : "text-muted")}>
            {e[`${lang}.slug`] ?? `English letters, numbers and hyphens: /${lang}/videos/${v.slug || "…"}`}
          </span>
        </label>
        <label className="font-semibold">
          Description <span className="font-normal text-muted">(optional)</span>
          <textarea value={v.description} onChange={(ev) => setText(lang, "description", ev.target.value)} rows={4} lang={lang} maxLength={3000} className={inputClass + " font-normal" + font} />
          {err(`${lang}.description`)}
        </label>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Search engines (optional)</summary>
          <div className="mt-2 flex flex-col gap-3">
            <label className="text-sm font-semibold">
              Search result title
              <input value={v.seoTitle} onChange={(ev) => setText(lang, "seoTitle", ev.target.value)} lang={lang} maxLength={120} className={inputClass + " font-normal" + font} />
              {err(`${lang}.seoTitle`)}
            </label>
            <label className="text-sm font-semibold">
              Search result description
              <textarea value={v.metaDescription} onChange={(ev) => setText(lang, "metaDescription", ev.target.value)} rows={2} lang={lang} maxLength={300} className={inputClass + " font-normal" + font} />
              {err(`${lang}.metaDescription`)}
            </label>
          </div>
        </details>
        <p className="text-xs text-muted">Leave every {lang === "si" ? "Sinhala" : "English"} field empty to keep the video off the {lang === "si" ? "Sinhala" : "English"} edition.</p>
      </fieldset>
    );
  };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="payload" value={payload} />
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={"rounded px-4 py-3 font-semibold " + (state.ok ? "bg-[#e1f4e8] text-[#14532d]" : "bg-[#fdecee] text-brand-dark")}>
          {state.message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="grid gap-4 rounded-lg bg-white p-4 sm:grid-cols-[1fr_160px]">
            <label className="font-semibold">
              YouTube link
              <input value={youtube} onChange={(ev) => { touch(); setYoutube(ev.target.value); }} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={!!e.youtube} className={inputClass + " font-normal"} />
              {err("youtube")}
              {!e.youtube && youtube && (
                <span className={"mt-1 block text-sm font-normal " + (youtubeId ? "text-muted" : "text-brand-dark")}>
                  {youtubeId ? (
                    <>
                      Video ID {youtubeId} ·{" "}
                      <a href={youtubeWatchUrl(youtubeId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy hover:underline">Check it on YouTube ↗</a>
                    </>
                  ) : (
                    "This does not look like a YouTube video link."
                  )}
                </span>
              )}
            </label>
            <label className="font-semibold">
              Length
              <input value={duration} onChange={(ev) => { touch(); setDuration(ev.target.value); }} placeholder="3:24" aria-invalid={!!e.duration} className={inputClass + " font-normal"} />
              {err("duration") ?? <span className="mt-1 block text-sm font-normal text-muted">minutes:seconds</span>}
            </label>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {textFields("si")}
            {textFields("en")}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Status</h2>
              <StatusBadge status={status ?? "DRAFT"} />
            </div>
            {status === "SCHEDULED" && video.scheduledAt && <p className="text-sm">{scheduledFuture ? "Goes live" : "Went live"} {formatDateTime(video.scheduledAt, "en")}</p>}
            {status === "PUBLISHED" && video.publishedAt && <p className="text-sm">Published {formatDateTime(video.publishedAt, "en")}</p>}
            {dirty && <p className="text-sm font-semibold text-notice-ink">You have unsaved changes.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="save" disabled={pending} className={isLive ? buttonPrimary : buttonSecondary}>
                {pending ? "Saving…" : isLive ? "Save changes" : "Save draft"}
              </button>
              {!isLive && <button type="submit" name="intent" value="publish" disabled={pending} className={buttonPrimary}>Publish now</button>}
            </div>
            {!isLive && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <label className="text-sm font-semibold">
                  Or publish later (Sri Lanka time)
                  <input type="datetime-local" value={scheduledAt} onChange={(ev) => { touch(); setScheduledAt(ev.target.value); }} aria-invalid={!!e.scheduledAt} className={inputClass + " font-normal"} />
                </label>
                {err("scheduledAt")}
                <button type="submit" name="intent" value="schedule" disabled={pending} className={buttonSecondary}>{scheduledFuture ? "Change schedule" : "Schedule"}</button>
              </div>
            )}
            {(isLive || scheduledFuture) && (
              <button type="submit" name="intent" value="unpublish" disabled={pending} className="self-start text-sm font-semibold text-brand-dark hover:underline">
                {scheduledFuture ? "Cancel the schedule" : "Unpublish (remove from the site)"}
              </button>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold">Image</h2>
            <MediaPicker images={images} value={thumbnailMediaId} onChange={(v) => { touch(); setThumbnailMediaId(v); }} />
            <p className="text-xs text-muted">Left empty, YouTube&rsquo;s own thumbnail is copied here when you save.</p>
            {err("thumbnailMediaId")}
          </section>

          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <label className="text-sm font-semibold">
              Category <span className="font-normal text-muted">(e.g. රසවින්දන)</span>
              <select value={categoryId} onChange={(ev) => { touch(); setCategoryId(ev.target.value); }} className={inputClass + " font-normal"}>
                <option value="">None</option>
                {options.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {err("categoryId")}
            </label>
            <label className="text-sm font-semibold">
              Related article <span className="font-normal text-muted">(optional)</span>
              <select value={articleId} onChange={(ev) => { touch(); setArticleId(ev.target.value); }} className={inputClass + " font-sans font-normal"}>
                <option value="">None</option>
                {options.articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              {err("articleId")}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={isFeatured} onChange={(ev) => { touch(); setIsFeatured(ev.target.checked); }} />
              Feature on the homepage first
            </label>
          </section>

          <section className="flex flex-col gap-2 rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold">Tags ({tagIds.length})</h2>
            <input value={tagFilter} onChange={(ev) => setTagFilter(ev.target.value)} placeholder="Find a tag…" aria-label="Find a tag" className={inputClass + " mt-0 font-sans text-sm"} />
            <ul className="max-h-48 overflow-y-auto">
              {shownTags.map((t) => (
                <li key={t.id}>
                  <label className="flex items-start gap-2 py-1 text-sm">
                    <input type="checkbox" className="mt-1" checked={tagIds.includes(t.id)} onChange={(ev) => { touch(); setTagIds(ev.target.checked ? [...tagIds, t.id] : tagIds.filter((x) => x !== t.id)); }} />
                    <span className="font-sans">{t.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {err("tags")}
          </section>
        </aside>
      </div>
    </form>
  );
}

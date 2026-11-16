"use client";

import { useActionState, useEffect, useState } from "react";
import { savePollAction, type PollFormState } from "@/server/admin/poll-actions";
import { slugify } from "@/lib/content/slug";
import { MediaPicker, type PickerImage } from "./MediaPicker";
import { buttonPrimary, buttonSecondary, inputClass } from "./ui";

type Text = { question: string; description: string; seoTitle: string; metaDescription: string };
type Option = { key: string; id: string | null; si: string; en: string; votes: number };

export type PollFormProps = {
  poll: {
    id: string | null;
    updatedAt: string | null;
    status: string;
    slug: string;
    startsAt: string;
    endsAt: string;
    resultsVisibility: "ALWAYS" | "AFTER_VOTE" | "AFTER_CLOSE";
    featuredMediaId: string | null;
    locked: boolean;
    si: Text;
    en: Text;
    options: { id: string | null; si: string; en: string; votes: number }[];
  };
  images: PickerImage[];
  limits: { question: number; description: number; option: number; minOptions: number; maxOptions: number };
};

const VISIBILITY = [
  { value: "AFTER_VOTE", label: "After voting", help: "Each reader sees the results once they have voted. Everyone sees them after closing." },
  { value: "ALWAYS", label: "Always", help: "Anyone can see the running results, even before voting." },
  { value: "AFTER_CLOSE", label: "Only after closing", help: "Nobody sees results until voting closes. Avoids influencing votes." },
] as const;

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function PollForm({ poll, images, limits }: PollFormProps) {
  const [state, action, pending] = useActionState(savePollAction, { ok: null, message: "", errors: {}, updatedAt: poll.updatedAt, seq: 0 } satisfies PollFormState);
  const [slug, setSlug] = useState(poll.slug);
  const [slugTouched, setSlugTouched] = useState(!!poll.id);
  const [startsAt, setStartsAt] = useState(poll.startsAt);
  const [endsAt, setEndsAt] = useState(poll.endsAt);
  const [visibility, setVisibility] = useState(poll.resultsVisibility);
  const [featuredMediaId, setFeaturedMediaId] = useState(poll.featuredMediaId ?? "");
  const [si, setSi] = useState(poll.si);
  const [en, setEn] = useState(poll.en);
  const [options, setOptions] = useState<Option[]>(() =>
    (poll.options.length ? poll.options : [{ id: null, si: "", en: "", votes: 0 }, { id: null, si: "", en: "", votes: 0 }]).map((o) => ({ ...o, key: o.id ?? newKey() })),
  );
  const [editedAtSeq, setEditedAtSeq] = useState<number | null>(null);
  const dirty = editedAtSeq !== null && editedAtSeq >= state.seq;
  const touch = () => setEditedAtSeq(state.seq);
  const e = state.errors;
  const isDraft = poll.status === "DRAFT";

  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const payload = JSON.stringify({
    id: poll.id ?? "",
    expectedUpdatedAt: state.updatedAt ?? "",
    slug,
    startsAt,
    endsAt,
    resultsVisibility: visibility,
    featuredMediaId,
    si,
    en,
    options: options.map((o) => ({ id: o.id, si: o.si, en: o.en })),
  });

  const err = (key: string) => (e[key] ? <span className="mt-1 block text-sm font-normal text-brand-dark">{e[key]}</span> : null);
  const setText = (lang: "si" | "en", key: keyof Text, value: string) => {
    touch();
    if (lang === "si") setSi({ ...si, [key]: value });
    else {
      setEn({ ...en, [key]: value });
      if (key === "question" && !slugTouched) setSlug(slugify(value));
    }
  };
  const setOption = (i: number, lang: "si" | "en", value: string) => {
    touch();
    setOptions(options.map((o, j) => (j === i ? { ...o, [lang]: value } : o)));
  };
  const move = (i: number, step: number) => {
    const j = i + step;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    touch();
    setOptions(next);
  };

  const textFields = (lang: "si" | "en") => {
    const v = lang === "si" ? si : en;
    const font = lang === "si" ? " font-sans" : "";
    return (
      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <legend className="px-1 font-bold">{lang === "si" ? "Sinhala (required)" : "English (optional)"}</legend>
        <label className="font-semibold">
          Question
          <input value={v.question} onChange={(ev) => setText(lang, "question", ev.target.value)} lang={lang} maxLength={limits.question} aria-invalid={!!e[`${lang}.question`]} className={inputClass + " font-normal" + font} />
          {err(`${lang}.question`)}
        </label>
        <label className="font-semibold">
          Background <span className="font-normal text-muted">(optional, shown under the question)</span>
          <textarea value={v.description} onChange={(ev) => setText(lang, "description", ev.target.value)} rows={3} lang={lang} maxLength={limits.description} className={inputClass + " font-normal" + font} />
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
        {lang === "en" && <p className="text-sm text-muted">Leave every English field empty to publish this poll on the Sinhala edition only. Both editions share one set of votes.</p>}
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

      <div className="grid gap-4 lg:grid-cols-2">
        {textFields("si")}
        {textFields("en")}
      </div>

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4" aria-labelledby="answers-heading">
        <h2 id="answers-heading" className="font-bold">Answers</h2>
        {poll.locked && (
          <p className="rounded bg-notice px-3 py-2 text-sm text-notice-ink">
            Voting has started, so answers can no longer be added, removed or reordered, and votes are never changed. You can still correct the wording.
          </p>
        )}
        {err("options")}
        <ol className="flex flex-col gap-3">
          {options.map((o, i) => (
            <li key={o.key} className="grid gap-2 rounded border border-line p-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-start">
              <span className="pt-2 font-bold text-muted">{i + 1}.</span>
              <label className="text-sm font-semibold">
                Sinhala
                <input value={o.si} onChange={(ev) => setOption(i, "si", ev.target.value)} lang="si" maxLength={limits.option} aria-invalid={!!e[`options.${i}.si`]} className={inputClass + " font-sans font-normal"} />
                {err(`options.${i}.si`)}
              </label>
              <label className="text-sm font-semibold">
                English
                <input value={o.en} onChange={(ev) => setOption(i, "en", ev.target.value)} maxLength={limits.option} aria-invalid={!!e[`options.${i}.en`]} className={inputClass + " font-normal"} />
                {err(`options.${i}.en`)}
              </label>
              <div className="flex gap-1 pt-6">
                {poll.locked ? (
                  <span className="text-sm text-muted">{o.votes} vote{o.votes === 1 ? "" : "s"}</span>
                ) : (
                  <>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="min-h-9 min-w-9 rounded border border-line disabled:opacity-40" aria-label={`Move answer ${i + 1} up`}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === options.length - 1} className="min-h-9 min-w-9 rounded border border-line disabled:opacity-40" aria-label={`Move answer ${i + 1} down`}>↓</button>
                    <button
                      type="button"
                      onClick={() => {
                        touch();
                        setOptions(options.filter((_, j) => j !== i));
                      }}
                      disabled={options.length <= limits.minOptions}
                      className="min-h-9 rounded px-2 text-sm font-semibold text-brand-dark hover:bg-soft disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!poll.locked && (
          <div>
            <button
              type="button"
              className={buttonSecondary}
              disabled={options.length >= limits.maxOptions}
              onClick={() => {
                touch();
                setOptions([...options, { key: newKey(), id: null, si: "", en: "", votes: 0 }]);
              }}
            >
              Add an answer
            </button>
            <span className="ml-3 text-sm text-muted">{limits.minOptions} to {limits.maxOptions} answers.</span>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-4 rounded-lg bg-white p-4">
          <h2 className="font-bold">Voting period and results</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="font-semibold">
              Voting opens (Sri Lanka time)
              <input type="datetime-local" value={startsAt} disabled={poll.locked} onChange={(ev) => { touch(); setStartsAt(ev.target.value); }} aria-invalid={!!e.startsAt} className={inputClass + " font-normal disabled:bg-soft"} />
              {err("startsAt")}
              {poll.locked && <span className="mt-1 block text-sm font-normal text-muted">Fixed once voting has started.</span>}
            </label>
            <label className="font-semibold">
              Voting closes (Sri Lanka time)
              <input type="datetime-local" value={endsAt} onChange={(ev) => { touch(); setEndsAt(ev.target.value); }} aria-invalid={!!e.endsAt} className={inputClass + " font-normal"} />
              {err("endsAt")}
            </label>
          </div>
          <fieldset>
            <legend className="font-semibold">Show results</legend>
            <div className="mt-2 flex flex-col gap-2">
              {VISIBILITY.map((v) => (
                <label key={v.value} className="flex items-start gap-2">
                  <input type="radio" name="visibility" className="mt-1" checked={visibility === v.value} onChange={() => { touch(); setVisibility(v.value); }} />
                  <span><span className="font-semibold">{v.label}.</span> <span className="text-sm text-muted">{v.help}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="font-semibold">
            Web address (slug)
            <input
              value={slug}
              disabled={!isDraft}
              onChange={(ev) => { touch(); setSlugTouched(true); setSlug(ev.target.value.toLowerCase()); }}
              maxLength={120}
              aria-invalid={!!e.slug}
              className={inputClass + " font-normal disabled:bg-soft"}
            />
            <span className={"mt-1 block text-sm font-normal " + (e.slug ? "text-brand-dark" : "text-muted")}>
              {e.slug ?? (isDraft ? `English letters, numbers and hyphens. The poll appears at /si/public-opinions/${slug || "…"}` : "Fixed once published, because links to it have been shared.")}
            </span>
          </label>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold">Image (optional)</h2>
            <MediaPicker images={images} value={featuredMediaId} onChange={(v) => { touch(); setFeaturedMediaId(v); }} />
            {err("featuredMediaId")}
          </section>
          <section className="flex flex-col gap-2 rounded-lg bg-white p-4">
            {dirty && <p className="text-sm font-semibold text-notice-ink">You have unsaved changes.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="intent" value="save" disabled={pending} className={isDraft ? buttonSecondary : buttonPrimary}>
                {pending ? "Saving…" : isDraft ? "Save draft" : "Save changes"}
              </button>
              {isDraft && (
                <button type="submit" name="intent" value="publish" disabled={pending} className={buttonPrimary}>Publish</button>
              )}
            </div>
            {isDraft && <p className="text-sm text-muted">Publishing makes the poll visible. Voting opens and closes automatically at the times set.</p>}
          </section>
        </aside>
      </div>
    </form>
  );
}

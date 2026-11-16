"use client";

import { useActionState, useState } from "react";
import { createArticleAction, type CreateArticleState } from "@/server/admin/article-actions";
import { slugify } from "@/lib/content/slug";
import { buttonPrimary, inputClass } from "./ui";

type Option = { id: string; label: string };

export function NewArticleForm({ categories }: { categories: Option[] }) {
  const initial: CreateArticleState = { errors: {}, values: { headline: "", slug: "", locale: "si", primaryCategoryId: "" } };
  const [state, action, pending] = useActionState(createArticleAction, initial);
  // Controlled fields: React 19 clears uncontrolled forms after each submission.
  const [locale, setLocale] = useState(state.values.locale);
  const [headline, setHeadline] = useState(state.values.headline);
  const [slug, setSlug] = useState(state.values.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState(state.values.primaryCategoryId);
  const e = state.errors;

  function onHeadline(value: string) {
    setHeadline(value);
    if (!slugTouched && locale === "en") setSlug(slugify(value));
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5 rounded-lg bg-white p-5">
      {e.form && <p role="alert" className="font-semibold text-brand-dark">{e.form}</p>}
      <fieldset>
        <legend className="font-semibold">Write it first in</legend>
        <div className="mt-2 flex gap-5">
          {(["si", "en"] as const).map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input type="radio" name="locale" value={l} checked={locale === l} onChange={() => setLocale(l)} />
              {l === "si" ? "Sinhala" : "English"}
            </label>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted">You can add the other language afterwards from the article page.</p>
      </fieldset>

      <label className="font-semibold">
        Headline
        <input
          name="headline"
          value={headline}
          onChange={(ev) => onHeadline(ev.target.value)}
          required
          maxLength={200}
          lang={locale}
          aria-invalid={!!e.headline}
          aria-describedby={e.headline ? "headline-error" : undefined}
          className={inputClass + " font-sans font-normal"}
        />
        {e.headline && <span id="headline-error" className="mt-1 block text-sm text-brand-dark">{e.headline}</span>}
      </label>

      <label className="font-semibold">
        Web address (slug)
        <input
          name="slug"
          value={slug}
          onChange={(ev) => {
            setSlugTouched(true);
            setSlug(ev.target.value.toLowerCase());
          }}
          required
          maxLength={120}
          pattern="[a-z0-9\-]+"
          aria-invalid={!!e.slug}
          aria-describedby="slug-help"
          className={inputClass + " font-normal"}
        />
        <span id="slug-help" className={"mt-1 block text-sm font-normal " + (e.slug ? "text-brand-dark" : "text-muted")}>
          {e.slug ?? "English letters, numbers and hyphens, e.g. new-train-timetable. For Sinhala articles, type a short English version of the headline."}
        </span>
      </label>

      <label className="font-semibold">
        Category
        <select
          name="primaryCategoryId"
          value={category}
          onChange={(ev) => setCategory(ev.target.value)}
          required
          aria-invalid={!!e.primaryCategoryId}
          className={inputClass + " font-normal"}
        >
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {e.primaryCategoryId && <span className="mt-1 block text-sm text-brand-dark">{e.primaryCategoryId}</span>}
      </label>

      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

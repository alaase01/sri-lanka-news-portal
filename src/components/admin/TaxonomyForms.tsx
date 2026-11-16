"use client";

import { useActionState, useState } from "react";
import { saveCategoryAction, saveTagAction, type TaxonomyFormState } from "@/server/admin/taxonomy-actions";
import { slugify } from "@/lib/content/slug";
import { buttonPrimary, inputClass } from "./ui";

type Lang = "si" | "en";
const LANG_NAME: Record<Lang, string> = { si: "Sinhala", en: "English" };
const empty: TaxonomyFormState = { errors: {}, message: "" };

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <span id={id} className="mt-1 block text-sm font-normal text-brand-dark">{text}</span> : null;
}

function FormMessage({ state }: { state: TaxonomyFormState }) {
  return state.message ? <p role="alert" className="rounded bg-[#fdecee] px-4 py-3 font-semibold text-brand-dark">{state.message}</p> : null;
}

/** Name + slug for one language. The English name suggests both slugs until a slug is edited by hand. */
function NameSlug({
  lang,
  values,
  onChange,
  errors,
  withDescription,
}: {
  lang: Lang;
  values: { name: string; slug: string; description: string };
  onChange: (v: { name: string; slug: string; description: string }) => void;
  errors: TaxonomyFormState["errors"];
  withDescription?: boolean;
}) {
  const e = (k: string) => errors[`${lang}.${k}`];
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <legend className="px-1 font-bold">{LANG_NAME[lang]}</legend>
      <label className="font-semibold">
        Name
        <input
          name={`${lang}.name`}
          value={values.name}
          onChange={(ev) => onChange({ ...values, name: ev.target.value })}
          maxLength={80}
          lang={lang}
          aria-invalid={!!e("name")}
          aria-describedby={e("name") ? `${lang}-name-error` : undefined}
          className={inputClass + " font-normal" + (lang === "si" ? " font-sans" : "")}
        />
        <FieldError id={`${lang}-name-error`} text={e("name")} />
      </label>
      <label className="font-semibold">
        Slug (web address)
        <input
          name={`${lang}.slug`}
          value={values.slug}
          onChange={(ev) => onChange({ ...values, slug: ev.target.value.toLowerCase() })}
          maxLength={120}
          aria-invalid={!!e("slug")}
          aria-describedby={`${lang}-slug-help`}
          className={inputClass + " font-normal"}
        />
        <span id={`${lang}-slug-help`} className={"mt-1 block text-sm font-normal " + (e("slug") ? "text-brand-dark" : "text-muted")}>
          {e("slug") ?? "English letters, numbers and hyphens."}
        </span>
      </label>
      {withDescription && (
        <label className="font-semibold">
          Description <span className="font-normal text-muted">(optional, shown on the category page)</span>
          <textarea
            name={`${lang}.description`}
            value={values.description}
            onChange={(ev) => onChange({ ...values, description: ev.target.value })}
            rows={2}
            maxLength={300}
            lang={lang}
            className={inputClass + " font-normal" + (lang === "si" ? " font-sans" : "")}
          />
          <FieldError id={`${lang}-description-error`} text={e("description")} />
        </label>
      )}
    </fieldset>
  );
}

type Texts = Record<Lang, { name: string; slug: string; description: string }>;

function useBilingual(initial: Texts, autoSlug: boolean) {
  const [texts, setTexts] = useState(initial);
  const [slugTouched, setSlugTouched] = useState<Record<Lang, boolean>>({ si: !autoSlug, en: !autoSlug });
  const update = (lang: Lang) => (v: Texts[Lang]) => {
    const next = { ...texts, [lang]: v };
    const touched = { ...slugTouched };
    if (v.slug !== texts[lang].slug) touched[lang] = true;
    // The English name drives slug suggestions for both languages.
    if (lang === "en" && v.name !== texts.en.name) {
      const s = slugify(v.name);
      if (!touched.en) next.en = { ...next.en, slug: s };
      if (!touched.si) next.si = { ...next.si, slug: s };
    }
    setSlugTouched(touched);
    setTexts(next);
  };
  return { texts, update };
}

export type CategoryFormValues = {
  id: string | null;
  parentId: string;
  sortOrder: number;
  isVisible: boolean;
  si: { name: string; slug: string; description: string };
  en: { name: string; slug: string; description: string };
};

export function CategoryForm({ initial, parents }: { initial: CategoryFormValues; parents: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(saveCategoryAction, empty);
  const { texts, update } = useBilingual({ si: initial.si, en: initial.en }, !initial.id);
  const [parentId, setParentId] = useState(initial.parentId);
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder));
  const [isVisible, setIsVisible] = useState(initial.isVisible);
  const e = state.errors;

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5 rounded-lg bg-white p-5">
      <FormMessage state={state} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <NameSlug lang="en" values={texts.en} onChange={update("en")} errors={e} withDescription />
        <NameSlug lang="si" values={texts.si} onChange={update("si")} errors={e} withDescription />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="font-semibold md:col-span-2">
          Inside
          <select name="parentId" value={parentId} onChange={(ev) => setParentId(ev.target.value)} aria-invalid={!!e.parentId} className={inputClass + " font-normal"}>
            <option value="">Nothing (a main section)</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <FieldError id="parent-error" text={e.parentId} />
        </label>
        <label className="font-semibold">
          Order
          <input name="sortOrder" type="number" step={1} value={sortOrder} onChange={(ev) => setSortOrder(ev.target.value)} aria-invalid={!!e.sortOrder} className={inputClass + " font-normal"} />
          <span className="mt-1 block text-sm font-normal text-muted">{e.sortOrder ?? "Lower numbers come first."}</span>
        </label>
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" name="isVisible" checked={isVisible} onChange={(ev) => setIsVisible(ev.target.checked)} />
        Visible on the site
      </label>
      <p className="-mt-3 text-sm text-muted">When unticked, the category&rsquo;s page and links are hidden from readers. Its articles stay published under any other categories they have.</p>
      {initial.id && (
        <p className="text-sm text-muted">Changing a slug changes the address of this category&rsquo;s page. Links to its articles keep working.</p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>{pending ? "Saving…" : initial.id ? "Save category" : "Create category"}</button>
      </div>
    </form>
  );
}

export type TagFormValues = { id: string | null; si: { name: string; slug: string }; en: { name: string; slug: string } };

export function TagForm({ initial, compact }: { initial: TagFormValues; compact?: boolean }) {
  const [state, action, pending] = useActionState(saveTagAction, empty);
  const { texts, update } = useBilingual(
    { si: { ...initial.si, description: "" }, en: { ...initial.en, description: "" } },
    !initial.id,
  );
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg bg-white p-5">
      {compact && <h2 className="text-lg font-bold">New tag</h2>}
      <FormMessage state={state} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <p className="text-sm text-muted">Fill in one or both languages. A tag page exists only in the languages that have a name.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <NameSlug lang="en" values={texts.en} onChange={update("en")} errors={state.errors} />
        <NameSlug lang="si" values={texts.si} onChange={update("si")} errors={state.errors} />
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>{pending ? "Saving…" : initial.id ? "Save tag" : "Create tag"}</button>
      </div>
    </form>
  );
}

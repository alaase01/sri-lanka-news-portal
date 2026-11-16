import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/server/auth/session";
import { categoryOptions } from "@/server/admin/articles";
import { CURATION_LIMITS, getCuration, storyChoices } from "@/server/admin/homepage";
import { curationAction } from "@/server/admin/homepage-actions";
import { formatDateTime } from "@/lib/utils/dates";
import { LocaleText, Notice, PageHeader, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Homepage" };
export const instant = false;

const DONE: Record<string, string> = {
  "hero.add": "Added to the hero.",
  "hero.up": "Order changed.",
  "hero.down": "Order changed.",
  "hero.remove": "Removed from the hero.",
  "breaking.add": "Added to the breaking-news ticker.",
  "breaking.end": "Taken off the ticker.",
  "block.add": "Category block added.",
  "block.up": "Order changed.",
  "block.down": "Order changed.",
  "block.enable": "Block shown on the homepage.",
  "block.disable": "Block hidden from the homepage.",
  "block.remove": "Category block removed.",
};

function requestTime(): Date {
  return new Date();
}

export default async function HomepageCurationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const locale = sp.lang === "en" ? "en" : "si";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const now = requestTime();
  const [curation, stories, categories] = await Promise.all([getCuration(locale, now), storyChoices(locale, now, q), categoryOptions()]);
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  const langName = locale === "si" ? "Sinhala" : "English";
  const usedCategories = new Set(curation.blocks.map((b) => b.categoryId));

  /** One small form per button, each carrying what to do and to which item. */
  const act = (op: string, itemId: string, label: ReactNode, className = buttonSecondary, aria?: string) => (
    <form action={curationAction}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className={className} aria-label={aria}>{label}</button>
    </form>
  );
  const small = "min-h-9 min-w-9 rounded border border-line px-2 text-sm font-semibold hover:bg-soft";
  const storyPicker = (
    <select name="articleId" required className={inputClass + " font-sans"} defaultValue="">
      <option value="" disabled>Choose a published story…</option>
      {stories.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
  const ends = (d: Date | null) => (d ? `until ${formatDateTime(d.toISOString(), "en")}` : "no end time");

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Homepage">
        <a href={`/${locale}`} target="_blank" rel="noopener" className={buttonSecondary + " inline-flex items-center"}>View the {langName} homepage ↗</a>
      </PageHeader>
      <p className="text-body">Choose what leads the homepage. Changes appear on the site within a minute.</p>

      <nav aria-label="Edition" className="flex gap-2 border-b border-line">
        {(["si", "en"] as const).map((l) => (
          <Link
            key={l}
            href={`/admin/homepage?lang=${l}`}
            aria-current={l === locale ? "page" : undefined}
            className={"-mb-px rounded-t border px-4 py-2 font-semibold " + (l === locale ? "border-line border-b-surface bg-surface" : "border-transparent text-navy hover:underline")}
          >
            {l === "si" ? "Sinhala edition" : "English edition"}
          </Link>
        ))}
      </nav>

      {done && <Notice>{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {/* ── Hero ── */}
      <section className="flex flex-col gap-3 rounded-lg bg-white p-5" aria-labelledby="hero-heading">
        <h2 id="hero-heading" className="text-lg font-bold">Hero stories ({langName}) · {curation.hero.length}/{CURATION_LIMITS.hero}</h2>
        {curation.hero.length === 0 ? (
          <p className="text-sm text-muted">None chosen. The homepage shows the latest stories there automatically, preferring ones with a photo.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {curation.hero.map((h, i) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-6 font-bold text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <LocaleText locale={locale} className="font-semibold">{h.headline}</LocaleText>
                  <p className="text-xs text-muted">
                    {h.live ? "Shown" : <span className="font-semibold text-brand-dark">Not shown: the story is unpublished or the time has ended</span>} · {ends(h.endsAt)}
                  </p>
                </div>
                <div className="flex gap-1">
                  {i > 0 && act("hero.up", h.id, "↑", small, "Move up")}
                  {i < curation.hero.length - 1 && act("hero.down", h.id, "↓", small, "Move down")}
                  {act("hero.remove", h.id, "Remove", "min-h-9 rounded px-2 text-sm font-semibold text-brand-dark hover:bg-soft")}
                </div>
              </li>
            ))}
          </ol>
        )}
        {curation.hero.length < CURATION_LIMITS.hero && (
          <form action={curationAction} className="grid gap-3 border-t border-line pt-3 md:grid-cols-[1fr_180px_auto] md:items-end">
            <input type="hidden" name="op" value="hero.add" />
            <input type="hidden" name="locale" value={locale} />
            <label className="text-sm font-semibold">Story{storyPicker}</label>
            <label className="text-sm font-semibold">
              Keep it there
              <select name="duration" defaultValue="none" className={inputClass}>
                <option value="none">Until I remove it</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="1d">1 day</option>
                <option value="3d">3 days</option>
                <option value="7d">7 days</option>
              </select>
            </label>
            <button type="submit" className={buttonPrimary}>Add to hero</button>
          </form>
        )}
      </section>

      {/* ── Breaking news ── */}
      <section className="flex flex-col gap-3 rounded-lg bg-white p-5" aria-labelledby="breaking-heading">
        <h2 id="breaking-heading" className="text-lg font-bold">Breaking-news ticker ({langName}) · {curation.breaking.length}/{CURATION_LIMITS.breaking}</h2>
        {curation.breaking.length === 0 ? (
          <p className="text-sm text-muted">Nothing in the ticker, so it is hidden.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {curation.breaking.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <LocaleText locale={locale} className="font-semibold">{b.customText ?? b.headline}</LocaleText>
                  <p className="text-xs text-muted">
                    {b.customText && <><LocaleText locale={locale}>{b.headline}</LocaleText> · </>}
                    {b.live ? "Shown" : <span className="font-semibold text-brand-dark">Not shown: ended or the story is unpublished</span>} · {ends(b.endsAt)}
                  </p>
                </div>
                {act("breaking.end", b.id, "Take off", "min-h-9 rounded px-2 text-sm font-semibold text-brand-dark hover:bg-soft")}
              </li>
            ))}
          </ul>
        )}
        {curation.breaking.length < CURATION_LIMITS.breaking && (
          <form action={curationAction} className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
            <input type="hidden" name="op" value="breaking.add" />
            <input type="hidden" name="locale" value={locale} />
            <label className="text-sm font-semibold md:col-span-2">Story{storyPicker}</label>
            <label className="text-sm font-semibold">
              Ticker text <span className="font-normal text-muted">(optional; the headline is used when empty)</span>
              <input name="text" maxLength={CURATION_LIMITS.breakingText} lang={locale} className={inputClass + " font-sans"} />
            </label>
            <label className="text-sm font-semibold">
              Show for
              <select name="duration" defaultValue="6h" className={inputClass}>
                <option value="1h">1 hour</option>
                <option value="3h">3 hours</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="1d">1 day</option>
                <option value="none">Until I take it off</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button type="submit" className={buttonPrimary}>Add to ticker</button>
            </div>
          </form>
        )}
      </section>

      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="lang" value={locale} />
        <label className="text-sm font-semibold">
          Story not in the lists above? Search older stories
          <input name="q" defaultValue={q} maxLength={100} className={inputClass + " font-sans"} />
        </label>
        <button type="submit" className={buttonSecondary}>Search</button>
        {q && <Link href={`/admin/homepage?lang=${locale}`} className="pb-2 text-sm font-semibold text-navy hover:underline">Clear</Link>}
        <span className="pb-2 text-xs text-muted">{stories.length} published {langName} stor{stories.length === 1 ? "y" : "ies"} to choose from</span>
      </form>

      {/* ── Category blocks ── */}
      <section className="flex flex-col gap-3 rounded-lg bg-white p-5" aria-labelledby="blocks-heading">
        <h2 id="blocks-heading" className="text-lg font-bold">Category blocks (both editions) · {curation.blocks.length}/{CURATION_LIMITS.blocks}</h2>
        <p className="text-sm text-muted">Each block shows the latest four stories of a category, lower down the homepage.</p>
        {curation.blocks.length === 0 ? (
          <p className="text-sm text-muted">None set up. The homepage shows the first four main sections that have stories.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {curation.blocks.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-6 font-bold text-muted">{i + 1}.</span>
                <span className={"min-w-0 flex-1 font-sans font-semibold " + (b.isEnabled ? "" : "text-muted line-through")}>{b.name}</span>
                <div className="flex gap-1">
                  {i > 0 && act("block.up", b.id, "↑", small, "Move up")}
                  {i < curation.blocks.length - 1 && act("block.down", b.id, "↓", small, "Move down")}
                  {b.isEnabled ? act("block.disable", b.id, "Hide", small) : act("block.enable", b.id, "Show", small)}
                  {act("block.remove", b.id, "Remove", "min-h-9 rounded px-2 text-sm font-semibold text-brand-dark hover:bg-soft")}
                </div>
              </li>
            ))}
          </ol>
        )}
        {curation.blocks.length < CURATION_LIMITS.blocks && (
          <form action={curationAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <input type="hidden" name="op" value="block.add" />
            <input type="hidden" name="locale" value={locale} />
            <label className="text-sm font-semibold">
              Category
              <select name="categoryId" required defaultValue="" className={inputClass}>
                <option value="" disabled>Choose…</option>
                {categories.filter((c) => !usedCategories.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonPrimary}>Add block</button>
          </form>
        )}
      </section>
    </div>
  );
}

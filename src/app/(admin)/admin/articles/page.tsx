import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { categoryOptions, listArticles, type ArticleListFilter } from "@/server/admin/articles";
import { restoreArticleAction } from "@/server/admin/article-actions";
import { formatDateTime } from "@/lib/utils/dates";
import { LocaleText, Notice, PageHeader, Pager, StatusBadge, buttonPrimary, buttonSecondary, inputClass, STATUS_LABEL } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Articles" };
export const instant = false;

type Search = Promise<Record<string, string | string[] | undefined>>;

const STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "HIDDEN"] as const;

/** Request time. Admin pages render per request, after the session check. */
function requestTime(): number {
  return Date.now();
}

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.slice(0, 100) : "";
}

export default async function ArticlesPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const sp = await searchParams;
  const locale = one(sp.lang) === "si" || one(sp.lang) === "en" ? (one(sp.lang) as "si" | "en") : undefined;
  const statusParam = one(sp.status);
  const status = (STATUSES as readonly string[]).includes(statusParam) || statusParam === "MISSING" ? (statusParam as ArticleListFilter["status"]) : undefined;
  const page = Math.min(Math.max(Number.parseInt(one(sp.page), 10) || 1, 1), 1000);
  const filter: ArticleListFilter = { q: one(sp.q), locale, status, categoryId: one(sp.category) || undefined, deleted: one(sp.bin) === "1", page };

  const [list, categories] = await Promise.all([listArticles(filter), categoryOptions()]);
  const query = (p: number) => {
    const params = new URLSearchParams();
    for (const k of ["q", "lang", "status", "category", "bin"]) if (one(sp[k])) params.set(k, one(sp[k]));
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/admin/articles${s ? `?${s}` : ""}`;
  };
  const now = requestTime();

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title={filter.deleted ? "Articles in the bin" : "Articles"}>
        {filter.deleted ? (
          <Link href="/admin/articles" className={buttonSecondary + " inline-flex items-center"}>Back to articles</Link>
        ) : (
          <>
            <Link href="/admin/articles?bin=1" className={buttonSecondary + " inline-flex items-center"}>Bin</Link>
            <Link href="/admin/articles/new" className={buttonPrimary + " inline-flex items-center"}>New article</Link>
          </>
        )}
      </PageHeader>

      {one(sp.binned) === "1" && <Notice>The article was moved to the bin and removed from the site. You can restore it from the bin.</Notice>}

      <form method="get" className="grid gap-3 rounded-lg bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" role="search">
        {filter.deleted && <input type="hidden" name="bin" value="1" />}
        <label className="text-sm font-semibold lg:col-span-2">
          Headline contains
          <input name="q" defaultValue={filter.q} className={inputClass + " font-sans"} maxLength={100} />
        </label>
        <label className="text-sm font-semibold">
          Language
          <select name="lang" defaultValue={locale ?? ""} className={inputClass}>
            <option value="">Either</option>
            <option value="si">Sinhala</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Status
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
            <option value="MISSING">Not written yet (choose a language)</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Category
          <select name="category" defaultValue={filter.categoryId ?? ""} className={inputClass}>
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={buttonPrimary}>Filter</button>
          <Link href={filter.deleted ? "/admin/articles?bin=1" : "/admin/articles"} className={buttonSecondary + " inline-flex items-center"}>Clear</Link>
        </div>
      </form>

      <p className="text-sm text-muted">{list.total.toLocaleString("en-US")} article(s)</p>

      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Headline</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sinhala</th>
              <th scope="col" className="px-4 py-3 font-semibold">English</th>
              <th scope="col" className="px-4 py-3 font-semibold">Category</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last change</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No articles match.</td>
              </tr>
            )}
            {list.rows.map((row) => {
              const lead = row.versions.si ? "si" : "en";
              const v = row.versions[lead];
              return (
                <tr key={row.id} className="border-b border-line align-top last:border-0">
                  <td className="max-w-md px-4 py-3">
                    {filter.deleted ? (
                      <div className="flex flex-col gap-2">
                        <LocaleText locale={lead} className="font-semibold">{v?.headline}</LocaleText>
                        <form action={restoreArticleAction}>
                          <input type="hidden" name="articleId" value={row.id} />
                          <button type="submit" className={buttonSecondary}>Restore</button>
                        </form>
                      </div>
                    ) : (
                      <Link href={`/admin/articles/${row.id}/${lead}`} className="font-semibold text-navy hover:underline">
                        <LocaleText locale={lead}>{v?.headline}</LocaleText>
                      </Link>
                    )}
                  </td>
                  {(["si", "en"] as const).map((l) => {
                    const t = row.versions[l];
                    const due = t?.status === "SCHEDULED" && t.scheduledAt && t.scheduledAt.getTime() > now;
                    return (
                      <td key={l} className="px-4 py-3">
                        {filter.deleted ? (
                          <StatusBadge status={t?.status} />
                        ) : (
                          <Link href={`/admin/articles/${row.id}/${l}`} aria-label={`${l === "si" ? "Sinhala" : "English"} version`}>
                            <StatusBadge status={t?.status} />
                          </Link>
                        )}
                        {due && t?.scheduledAt && <p className="mt-1 text-xs text-muted">{formatDateTime(t.scheduledAt.toISOString(), "en")}</p>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">{row.categoryName}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(row.updatedAt.toISOString(), "en")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={list.page} pages={list.pages} href={query} />
    </div>
  );
}

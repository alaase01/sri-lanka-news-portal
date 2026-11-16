import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listTags } from "@/server/admin/taxonomy";
import { TagForm } from "@/components/admin/TaxonomyForms";
import { LocaleText, Notice, PageHeader, Pager, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Tags" };
export const instant = false;

const SAVED: Record<string, string> = { created: "Tag created.", updated: "Tag saved.", deleted: "Tag deleted and removed from its articles." };

export default async function TagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = Math.min(Math.max(Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1, 1), 1000);
  const list = await listTags({ q, page });
  const saved = typeof sp.saved === "string" ? SAVED[sp.saved] : undefined;
  const href = (p: number) => `/admin/tags?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Tags" />
      {saved && <Notice>{saved}</Notice>}
      <TagForm compact initial={{ id: null, si: { name: "", slug: "" }, en: { name: "", slug: "" } }} />

      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold">
          Find a tag
          <input name="q" defaultValue={q} className={inputClass + " font-sans"} maxLength={80} />
        </label>
        <button type="submit" className={buttonPrimary}>Search</button>
        {q && <Link href="/admin/tags" className={buttonSecondary + " inline-flex items-center"}>Clear</Link>}
      </form>

      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">English</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sinhala</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Articles</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No tags found.</td></tr>
            )}
            {list.rows.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/tags/${t.id}`} className="font-semibold text-navy hover:underline">{t.en?.name ?? "—"}</Link>
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/admin/tags/${t.id}`} className="text-navy hover:underline"><LocaleText locale="si">{t.si?.name ?? "—"}</LocaleText></Link>
                </td>
                <td className="px-4 py-2.5 text-right">{t.articleCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={list.page} pages={list.pages} href={href} />
    </div>
  );
}

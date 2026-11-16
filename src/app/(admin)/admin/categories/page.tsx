import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listCategoryTree } from "@/server/admin/taxonomy";
import { LocaleText, Notice, PageHeader, buttonPrimary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Categories" };
export const instant = false;

const SAVED: Record<string, string> = { created: "Category created.", updated: "Category saved.", deleted: "Category deleted." };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tree = await listCategoryTree();
  const saved = typeof sp.saved === "string" ? SAVED[sp.saved] : undefined;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Categories">
        <Link href="/admin/categories/new" className={buttonPrimary + " inline-flex items-center"}>New category</Link>
      </PageHeader>
      {saved && <Notice>{saved}</Notice>}
      <p className="text-body">Main sections and their subcategories, up to three levels. Categories appear in article addresses and on their own pages. The main menu is set separately (a menu editor is planned).</p>
      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">English</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sinhala</th>
              <th scope="col" className="px-4 py-3 font-semibold">Address</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Articles</th>
              <th scope="col" className="px-4 py-3 font-semibold">On the site</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5" style={{ paddingLeft: `${1 + (c.depth - 1) * 1.5}rem` }}>
                  {c.depth > 1 && <span aria-hidden className="mr-1 text-muted">└</span>}
                  <Link href={`/admin/categories/${c.id}`} className="font-semibold text-navy hover:underline">{c.en.name || "(no English name)"}</Link>
                </td>
                <td className="px-4 py-2.5"><LocaleText locale="si">{c.si.name}</LocaleText></td>
                <td className="px-4 py-2.5 text-muted">{c.en.slug}</td>
                <td className="px-4 py-2.5 text-right">{c.articleCount}</td>
                <td className="px-4 py-2.5">{c.isVisible ? "Visible" : <span className="text-muted">Hidden</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

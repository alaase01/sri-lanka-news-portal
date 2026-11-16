import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { listCategoryTree, MAX_CATEGORY_DEPTH } from "@/server/admin/taxonomy";
import { deleteCategoryAction } from "@/server/admin/taxonomy-actions";
import { CategoryForm } from "@/components/admin/TaxonomyForms";
import { Notice, PageHeader, buttonDanger } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Edit category" };
export const instant = false;

export default async function EditCategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tree = await listCategoryTree();
  const c = tree.find((x) => x.id === id);
  if (!c) notFound();

  // Exclude the category itself and everything inside it.
  const inside = new Set([c.id]);
  for (const x of tree) if (x.parentId && inside.has(x.parentId)) inside.add(x.id);
  const parents = tree
    .filter((x) => !inside.has(x.id) && x.depth < MAX_CATEGORY_DEPTH)
    .map((x) => ({ id: x.id, label: `${"— ".repeat(x.depth - 1)}${x.en.name || x.si.name}` }));
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/categories" className="text-sm font-semibold text-navy hover:underline">← Categories</Link>
      <PageHeader title={`Category: ${c.en.name || c.si.name}`} />
      {error && <Notice tone="error">{error}</Notice>}
      <CategoryForm
        initial={{ id: c.id, parentId: c.parentId ?? "", sortOrder: c.sortOrder, isVisible: c.isVisible, si: c.si, en: c.en }}
        parents={parents}
      />
      <section className="max-w-3xl rounded-lg bg-white p-5">
        <h2 className="font-bold">Delete this category</h2>
        <p className="mt-1 text-sm text-muted">
          Only possible when no articles, subcategories, videos, menu items or homepage sections use it. {c.articleCount > 0 ? `${c.articleCount} article(s) use it now.` : ""}
        </p>
        <form action={deleteCategoryAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="categoryId" value={c.id} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required /> Yes, delete it permanently
          </label>
          <button type="submit" className={buttonDanger}>Delete</button>
        </form>
      </section>
    </div>
  );
}

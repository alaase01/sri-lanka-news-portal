import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listCategoryTree, MAX_CATEGORY_DEPTH } from "@/server/admin/taxonomy";
import { CategoryForm } from "@/components/admin/TaxonomyForms";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "New category" };
export const instant = false;

export default async function NewCategoryPage() {
  await requireAdmin();
  const tree = await listCategoryTree();
  const parents = tree
    .filter((c) => c.depth < MAX_CATEGORY_DEPTH)
    .map((c) => ({ id: c.id, label: `${"— ".repeat(c.depth - 1)}${c.en.name || c.si.name}` }));
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/categories" className="text-sm font-semibold text-navy hover:underline">← Categories</Link>
      <PageHeader title="New category" />
      <CategoryForm
        initial={{ id: null, parentId: "", sortOrder: 0, isVisible: true, si: { name: "", slug: "", description: "" }, en: { name: "", slug: "", description: "" } }}
        parents={parents}
      />
    </div>
  );
}

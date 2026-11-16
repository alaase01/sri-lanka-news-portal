import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getTag } from "@/server/admin/taxonomy";
import { deleteTagAction } from "@/server/admin/taxonomy-actions";
import { TagForm } from "@/components/admin/TaxonomyForms";
import { PageHeader, buttonDanger } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Edit tag" };
export const instant = false;

export default async function EditTagPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const tag = await getTag(id);
  if (!tag) notFound();
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href="/admin/tags" className="text-sm font-semibold text-navy hover:underline">← Tags</Link>
      <PageHeader title={`Tag: ${tag.en?.name ?? tag.si?.name ?? ""}`} />
      <TagForm initial={{ id: tag.id, si: tag.si ?? { name: "", slug: "" }, en: tag.en ?? { name: "", slug: "" } }} />
      <section className="rounded-lg bg-white p-5">
        <h2 className="font-bold">Delete this tag</h2>
        <p className="mt-1 text-sm text-muted">It is removed from {tag.articleCount} article(s). The articles themselves are not changed otherwise.</p>
        <form action={deleteTagAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="tagId" value={tag.id} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required /> Yes, delete it
          </label>
          <button type="submit" className={buttonDanger}>Delete</button>
        </form>
      </section>
    </div>
  );
}

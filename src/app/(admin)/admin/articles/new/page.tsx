import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { categoryOptions } from "@/server/admin/articles";
import { NewArticleForm } from "@/components/admin/NewArticleForm";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "New article" };
export const instant = false;

export default async function NewArticlePage() {
  await requireAdmin();
  const categories = await categoryOptions();
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/articles" className="text-sm font-semibold text-navy hover:underline">← Articles</Link>
      <PageHeader title="New article" />
      <p className="max-w-2xl text-body">Start with the headline, web address and category. The draft opens in the editor, where you write the text. Nothing appears on the site until you publish.</p>
      <NewArticleForm categories={categories} />
    </div>
  );
}

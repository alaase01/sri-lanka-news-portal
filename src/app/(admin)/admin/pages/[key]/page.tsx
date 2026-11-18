import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getPageForEdit, PAGE_LIMITS } from "@/server/admin/pages";
import { LOCALE_NAME } from "@/components/admin/ui";
import { PageStateBadge } from "@/components/admin/page-state";
import { PageEditor } from "@/components/admin/PageEditor";
import type { Locale } from "@/lib/i18n/config";

export const metadata: Metadata = { title: "Edit page" };
export const instant = false;

export default async function EditStaticPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { key } = await params;
  if (!/^[a-z]{1,40}$/.test(key)) notFound();
  const page = await getPageForEdit(key);
  if (!page) notFound();
  const sp = await searchParams;
  const lang = sp.lang;
  const done = typeof sp.done === "string" ? sp.done : undefined;
  const locale: Locale = lang === "en" ? "en" : "si";
  const v = page.versions[locale];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/admin/pages" className="text-sm font-semibold text-navy hover:underline">← Static pages</Link>
      <nav aria-label="Language versions" className="flex gap-1 border-b border-line">
        {(["si", "en"] as const).map((l) => (
          <Link
            key={l}
            href={`/admin/pages/${key}?lang=${l}`}
            aria-current={l === locale ? "page" : undefined}
            className={`flex items-center gap-2 rounded-t px-4 py-2 font-semibold ${l === locale ? "bg-white text-navy" : "text-muted hover:text-navy"}`}
          >
            {LOCALE_NAME[l]} <PageStateBadge state={page.versions[l]?.state ?? "missing"} />
          </Link>
        ))}
      </nav>
      <PageEditor
        key={`${key}-${locale}-${v?.updatedAt.toISOString() ?? "new"}`}
        pageKey={key}
        slug={page.slug}
        locale={locale}
        limits={PAGE_LIMITS}
        initial={
          v
            ? {
                title: v.title,
                body: v.body,
                seoTitle: v.seoTitle,
                metaDescription: v.metaDescription,
                state: v.state,
                isPublished: v.isPublished,
                publishedAt: v.publishedAt?.toISOString() ?? null,
                updatedAt: v.updatedAt.toISOString(),
                updatedBy: v.updatedBy,
              }
            : null
        }
        otherLanguageTitle={page.versions[locale === "si" ? "en" : "si"]?.title ?? ""}
        done={done}
      />
    </div>
  );
}

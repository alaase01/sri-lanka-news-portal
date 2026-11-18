import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listPages } from "@/server/admin/pages";
import { formatDateTime } from "@/lib/utils/dates";
import { LOCALE_NAME, LocaleText, PageHeader } from "@/components/admin/ui";
import { PageStateBadge } from "@/components/admin/page-state";

export const metadata: Metadata = { title: "Static pages" };
export const instant = false;

export default async function StaticPagesList() {
  await requireAdmin();
  const pages = await listPages();

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Static pages" />
      <p className="max-w-3xl text-body">
        About, Contact and policy pages, in Sinhala and English. Each language is edited and published on its own. Saving a draft never changes the live page.
        Text in <strong>[[double brackets]]</strong> is a placeholder: a page cannot be published until every placeholder is filled in or removed. Published
        pages appear as links in the site footer.
      </p>
      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="p-3">Page</th>
              {(["si", "en"] as const).map((l) => (
                <th key={l} scope="col" className="p-3">{LOCALE_NAME[l]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pages.map((p) => (
              <tr key={p.key} className="align-top">
                <th scope="row" className="p-3">
                  <Link href={`/admin/pages/${p.key}`} className="text-base font-bold text-navy hover:underline">
                    {p.versions.en?.title || p.versions.si?.title || p.key}
                  </Link>
                  <div className="font-normal text-muted">/{p.slug}</div>
                </th>
                {(["si", "en"] as const).map((l) => {
                  const v = p.versions[l];
                  return (
                    <td key={l} className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        <PageStateBadge state={v?.state ?? "missing"} />
                        {v && <LocaleText locale={l} className="font-semibold">{v.title || "—"}</LocaleText>}
                        {v && v.placeholders > 0 && <span className="text-xs font-semibold text-brand-dark">{v.placeholders} placeholder{v.placeholders === 1 ? "" : "s"} to complete</span>}
                        {v && (
                          <span className="text-xs text-muted">
                            Updated {formatDateTime(v.updatedAt.toISOString(), "en")}
                            {v.updatedBy ? ` by ${v.updatedBy}` : ""}
                          </span>
                        )}
                        <Link href={`/admin/pages/${p.key}?lang=${l}`} className="text-sm font-semibold text-navy hover:underline">
                          Edit {LOCALE_NAME[l]}
                        </Link>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

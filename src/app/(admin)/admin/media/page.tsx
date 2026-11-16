import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listMedia } from "@/server/media/core";
import { mediaUrl } from "@/lib/content/media";
import { MediaUploader } from "@/components/admin/MediaForms";
import { Notice, PageHeader, Pager, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Media" };
export const instant = false;

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.min(Math.max(Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1, 1), 1000);
  const list = await listMedia({ q, page });
  const href = (p: number) => `/admin/media?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Media library" />
      {sp.deleted === "1" && <Notice>The image was deleted.</Notice>}
      {sp.error === "in-use" && <Notice tone="error">That image is in use, so it was not deleted. Replace it where it is used first.</Notice>}
      <MediaUploader />

      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold">
          Search descriptions and credits
          <input name="q" defaultValue={q} className={inputClass + " font-sans"} maxLength={100} />
        </label>
        <button type="submit" className={buttonPrimary}>Search</button>
        {q && <Link href="/admin/media" className={buttonSecondary + " inline-flex items-center"}>Clear</Link>}
      </form>

      <p className="text-sm text-muted">{list.total} image(s)</p>
      {list.items.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-muted">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.items.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-lg bg-white">
              <Link href={`/admin/media/${m.id}`} className="block hover:opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element -- already resized WebP */}
                <img src={mediaUrl(m.storageKey, 480)} alt={m.altEn || m.altSi} loading="lazy" className="aspect-video w-full object-cover" />
                <div className="p-3 text-sm">
                  <p className="line-clamp-2 font-sans">{m.altSi || m.altEn}</p>
                  <p className="mt-1 text-xs text-muted">
                    {m.width}×{m.height} · {m.uses ? `used ${m.uses}×` : "not used"}
                    {!m.altSi || !m.altEn ? " · description missing in one language" : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pages={list.pages} href={href} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listVideos } from "@/server/admin/videos";
import { videoStateAction } from "@/server/admin/video-actions";
import type { ArticleStatus } from "@/generated/prisma/client";
import { formatDuration } from "@/lib/content/youtube";
import { mediaUrl } from "@/lib/content/media";
import { formatDateTime } from "@/lib/utils/dates";
import { LocaleText, Notice, PageHeader, Pager, StatusBadge, buttonPrimary, buttonSecondary, inputClass, STATUS_LABEL } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Videos" };
export const instant = false;

const STATUSES: ArticleStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "HIDDEN"];

export default async function VideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 100) : "");
  const status = (STATUSES as string[]).includes(one("status")) ? (one("status") as ArticleStatus) : undefined;
  const deleted = one("bin") === "1";
  const list = await listVideos({ q: one("q"), status, deleted, page: Math.min(Math.max(Number.parseInt(one("page"), 10) || 1, 1), 1000) });
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const k of ["q", "status", "bin"]) if (one(k)) q.set(k, one(k));
    if (p > 1) q.set("page", String(p));
    return `/admin/videos${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title={deleted ? "Videos in the bin" : "Videos"}>
        {deleted ? (
          <Link href="/admin/videos" className={buttonSecondary + " inline-flex items-center"}>Back to videos</Link>
        ) : (
          <>
            <Link href="/admin/videos?bin=1" className={buttonSecondary + " inline-flex items-center"}>Bin</Link>
            <Link href="/admin/videos/new" className={buttonPrimary + " inline-flex items-center"}>New video</Link>
          </>
        )}
      </PageHeader>
      {one("binned") === "1" && <Notice>The video was moved to the bin and removed from the site. You can restore it from the bin.</Notice>}

      <form method="get" role="search" className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4">
        {deleted && <input type="hidden" name="bin" value="1" />}
        <label className="text-sm font-semibold">
          Title or YouTube ID
          <input name="q" defaultValue={one("q")} maxLength={100} className={inputClass + " font-sans"} />
        </label>
        <label className="text-sm font-semibold">
          Status
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonPrimary}>Filter</button>
      </form>

      {list.items.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-muted">No videos match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3">
              {v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP
                <img src={mediaUrl(v.thumbnail.storageKey, 480)} alt="" className="aspect-video w-36 rounded object-cover" />
              ) : (
                <span className="flex aspect-video w-36 items-center justify-center rounded bg-placeholder text-xs text-muted">No image</span>
              )}
              <div className="min-w-0 flex-1">
                {deleted ? (
                  <LocaleText locale="si" className="font-semibold">{v.title.si ?? v.title.en}</LocaleText>
                ) : (
                  <Link href={`/admin/videos/${v.id}`} className="font-semibold text-navy hover:underline">
                    <LocaleText locale="si">{v.title.si ?? v.title.en}</LocaleText>
                  </Link>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge status={v.status} />
                  {v.isFeatured && <span className="rounded bg-brand px-2 py-0.5 font-semibold text-white">Featured</span>}
                  <span>{formatDuration(v.durationSeconds)}</span>
                  {v.status === "SCHEDULED" && v.scheduledAt && <span>· {formatDateTime(v.scheduledAt.toISOString(), "en")}</span>}
                  {!v.title.si && <span>· English only</span>}
                  {!v.title.en && <span>· Sinhala only</span>}
                </p>
              </div>
              <form action={videoStateAction}>
                <input type="hidden" name="videoId" value={v.id} />
                {deleted ? (
                  <button type="submit" name="action" value="restore" className={buttonSecondary}>Restore</button>
                ) : (
                  <button type="submit" name="action" value={v.isFeatured ? "unfeature" : "feature"} className={buttonSecondary}>{v.isFeatured ? "Unfeature" : "Feature"}</button>
                )}
              </form>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pages={list.pages} href={href} />
    </div>
  );
}

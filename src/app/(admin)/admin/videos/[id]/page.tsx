import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getVideoForEdit } from "@/server/admin/videos";
import { videoStateAction } from "@/server/admin/video-actions";
import { videoFormOptions } from "@/server/admin/video-page-data";
import { VideoForm } from "@/components/admin/VideoForm";
import { Notice, PageHeader, buttonDanger, buttonSecondary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Edit video" };
export const instant = false;

function requestTime(): string {
  return new Date().toISOString();
}

export default async function EditVideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const v = await getVideoForEdit(id);
  if (!v) notFound();
  const { options, images } = await videoFormOptions(v.thumbnailMediaId);
  const blank = { title: "", description: "", slug: "", seoTitle: "", metaDescription: "" };
  const now = requestTime();
  const live = !v.deletedAt && (v.status === "PUBLISHED" || (v.status === "SCHEDULED" && !!v.scheduledAt && v.scheduledAt.toISOString() <= now));

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <Link href="/admin/videos" className="text-sm font-semibold text-navy hover:underline">← Videos</Link>
      <PageHeader title={v.translations.en?.title || v.translations.si?.title || "Video"}>
        {live && v.translations.si?.slug && (
          <a href={`/si/videos/${v.translations.si.slug}`} target="_blank" rel="noopener" className={buttonSecondary + " inline-flex items-center"}>View on the site ↗</a>
        )}
        {live && !v.translations.si && v.translations.en?.slug && (
          <a href={`/en/videos/${v.translations.en.slug}`} target="_blank" rel="noopener" className={buttonSecondary + " inline-flex items-center"}>View on the site ↗</a>
        )}
      </PageHeader>
      {sp.created === "1" && <Notice>The video was created as a draft.</Notice>}
      {sp.thumb === "failed" && <Notice tone="error">YouTube&rsquo;s thumbnail could not be fetched. Choose or upload an image under Image.</Notice>}

      {v.deletedAt ? (
        <section className="rounded-lg bg-white p-5">
          <p>This video is in the bin and not on the site.</p>
          <form action={videoStateAction} className="mt-3">
            <input type="hidden" name="videoId" value={v.id} />
            <button type="submit" name="action" value="restore" className={buttonSecondary}>Restore</button>
          </form>
        </section>
      ) : (
        <>
          <VideoForm
            key={`${v.id}-${typeof sp.t === "string" ? sp.t.slice(0, 20) : ""}`}
            now={now}
            video={{
              id: v.id,
              updatedAt: v.updatedAt.toISOString(),
              status: v.status,
              scheduledAt: v.scheduledAt?.toISOString() ?? null,
              publishedAt: v.publishedAt?.toISOString() ?? null,
              youtubeId: v.youtubeId,
              durationSeconds: v.durationSeconds,
              thumbnailMediaId: v.thumbnailMediaId,
              articleId: v.articleId,
              categoryId: v.categoryId,
              tagIds: v.tagIds,
              isFeatured: v.isFeatured,
              si: v.translations.si ?? blank,
              en: v.translations.en ?? blank,
            }}
            options={options}
            images={images}
          />
          <section className="max-w-3xl rounded-lg bg-white p-5">
            <h2 className="font-bold">Move to bin</h2>
            <p className="mt-1 text-sm text-muted">Removes the video from both editions at once. It can be restored from the bin.</p>
            <form action={videoStateAction} className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="videoId" value={v.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" value="yes" required /> Yes, remove it from the site
              </label>
              <button type="submit" name="action" value="bin" className={buttonDanger}>Move to bin</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

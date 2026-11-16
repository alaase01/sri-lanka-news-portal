import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { videoFormOptions } from "@/server/admin/video-page-data";
import { VideoForm } from "@/components/admin/VideoForm";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "New video" };
export const instant = false;

function requestTime(): string {
  return new Date().toISOString();
}

export default async function NewVideoPage() {
  await requireAdmin();
  const { options, images } = await videoFormOptions(null);
  const blank = { title: "", description: "", slug: "", seoTitle: "", metaDescription: "" };
  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <Link href="/admin/videos" className="text-sm font-semibold text-navy hover:underline">← Videos</Link>
      <PageHeader title="New video" />
      <p className="max-w-3xl text-body">Paste the YouTube link and give the video a title in one or both languages. Readers&rsquo; browsers only contact YouTube when they press play.</p>
      <VideoForm
        now={requestTime()}
        video={{ id: null, updatedAt: null, status: null, scheduledAt: null, publishedAt: null, youtubeId: "", durationSeconds: 0, thumbnailMediaId: null, articleId: null, categoryId: null, tagIds: [], isFeatured: false, si: blank, en: blank }}
        options={options}
        images={images}
      />
    </div>
  );
}

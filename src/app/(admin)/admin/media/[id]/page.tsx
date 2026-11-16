import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getMediaItems } from "@/server/media/core";
import { deleteMediaAction } from "@/server/media/actions";
import { mediaUrl } from "@/lib/content/media";
import { MediaTextForm } from "@/components/admin/MediaForms";
import { PageHeader, buttonDanger } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Image" };
export const instant = false;

export default async function MediaItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const [m] = await getMediaItems([id]);
  if (!m) notFound();
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href="/admin/media" className="text-sm font-semibold text-navy hover:underline">← Media library</Link>
      <PageHeader title="Image" />
      {/* eslint-disable-next-line @next/next/no-img-element -- already resized WebP */}
      <img src={mediaUrl(m.storageKey, 960)} alt={m.altEn || m.altSi} width={m.width} height={m.height} className="max-h-[480px] w-auto rounded-lg bg-white object-contain" />
      <p className="text-sm text-muted">
        {m.width}×{m.height} pixels · {(m.sizeBytes / 1024).toFixed(0)} KB (largest size) · uploaded {formatDateTime(m.createdAt.toISOString(), "en")} · {m.uses ? `used in ${m.uses} place(s)` : "not used"}
      </p>
      <MediaTextForm mediaId={m.id} initial={{ altSi: m.altSi, altEn: m.altEn, captionSi: m.captionSi, captionEn: m.captionEn, credit: m.credit ?? "" }} />
      <section className="rounded-lg bg-white p-5">
        <h2 className="font-bold">Delete this image</h2>
        <p className="mt-1 text-sm text-muted">{m.uses ? "This image is in use, so it cannot be deleted. Replace it where it is used first." : "Deletes the image files permanently."}</p>
        {!m.uses && (
          <form action={deleteMediaAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="mediaId" value={m.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required /> Yes, delete it permanently
            </label>
            <button type="submit" className={buttonDanger}>Delete</button>
          </form>
        )}
      </section>
    </div>
  );
}

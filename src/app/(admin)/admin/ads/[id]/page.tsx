import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getAd } from "@/server/admin/ads";
import { adListAction } from "@/server/admin/ad-actions";
import { adImageChoices } from "@/server/admin/ad-page-data";
import { AdForm } from "@/components/admin/AdForm";
import { Notice, PageHeader, buttonDanger } from "@/components/admin/ui";
import { toColomboInput } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Edit banner" };
export const instant = false;

export default async function EditAdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const ad = await getAd(id);
  if (!ad) notFound();
  const images = await adImageChoices([ad.desktopMediaId, ad.mobileMediaId].filter((x): x is string => !!x));
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : "";
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/admin/ads" className="text-sm font-semibold text-navy hover:underline">← Advertisements</Link>
      <PageHeader title={`Banner: ${ad.advertiser}`} />
      {error && <Notice tone="error">{error}</Notice>}
      <AdForm
        images={images}
        initial={{
          id: ad.id,
          updatedAt: ad.updatedAt.toISOString(),
          placement: ad.placement,
          advertiser: ad.advertiser,
          linkUrl: ad.linkUrl,
          desktopMediaId: ad.desktopMediaId ?? "",
          mobileMediaId: ad.mobileMediaId ?? "",
          showSi: ad.showSi,
          showEn: ad.showEn,
          startsAt: toColomboInput(ad.startsAt),
          endsAt: ad.endsAt ? toColomboInput(ad.endsAt) : "",
          isActive: ad.isActive,
        }}
      />
      <section className="rounded-lg bg-white p-5">
        <h2 className="font-bold">Delete this banner</h2>
        <p className="mt-1 text-sm text-muted">Removes the banner and its view and click counts. The images stay in the media library. To pause a booking instead, switch it off.</p>
        <form action={adListAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="adId" value={ad.id} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required /> Yes, delete it</label>
          <button type="submit" name="op" value="delete" className={buttonDanger}>Delete</button>
        </form>
      </section>
    </div>
  );
}

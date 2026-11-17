import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { adImageChoices } from "@/server/admin/ad-page-data";
import { AdForm } from "@/components/admin/AdForm";
import { PageHeader } from "@/components/admin/ui";
import { toColomboInput } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "New banner" };
export const instant = false;

function startNow(): string {
  return toColomboInput(new Date());
}

export default async function NewAdPage() {
  await requireAdmin();
  const images = await adImageChoices([]);
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/admin/ads" className="text-sm font-semibold text-navy hover:underline">← Advertisements</Link>
      <PageHeader title="New banner" />
      <AdForm
        images={images}
        initial={{ id: null, updatedAt: null, placement: "TOP", advertiser: "", linkUrl: "", desktopMediaId: "", mobileMediaId: "", showSi: true, showEn: true, startsAt: startNow(), endsAt: "", isActive: true }}
      />
    </div>
  );
}

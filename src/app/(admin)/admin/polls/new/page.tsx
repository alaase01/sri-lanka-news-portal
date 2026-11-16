import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { POLL_LIMITS } from "@/server/admin/polls";
import { listMedia } from "@/server/media/core";
import { PollForm } from "@/components/admin/PollForm";
import { PageHeader } from "@/components/admin/ui";
import { toColomboInput } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "New poll" };
export const instant = false;

function defaultTimes(): { startsAt: string; endsAt: string } {
  // Opens at the next full hour, runs for a week.
  const start = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  return { startsAt: toColomboInput(start), endsAt: toColomboInput(new Date(start.getTime() + 7 * 86_400_000)) };
}

export default async function NewPollPage() {
  await requireAdmin();
  const recent = await listMedia({ take: 30 });
  const times = defaultTimes();
  const empty = { question: "", description: "", seoTitle: "", metaDescription: "" };
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <Link href="/admin/polls" className="text-sm font-semibold text-navy hover:underline">← Public opinions</Link>
      <PageHeader title="New poll" />
      <PollForm
        poll={{ id: null, updatedAt: null, status: "DRAFT", slug: "", ...times, resultsVisibility: "AFTER_VOTE", featuredMediaId: null, locked: false, si: empty, en: empty, options: [] }}
        images={recent.items.map((m) => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, alt: m.altEn || m.altSi }))}
        limits={POLL_LIMITS}
      />
    </div>
  );
}

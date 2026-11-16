import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listPolls, type PollListFilter } from "@/server/admin/polls";
import { pollStateAction } from "@/server/admin/poll-actions";
import { formatDateTime } from "@/lib/utils/dates";
import type { PollPhase } from "@/lib/polls/phase";
import { LocaleText, Notice, PageHeader, Pager, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";
import { PHASE_LABEL, PHASE_STYLE } from "@/components/admin/poll-labels";

export const metadata: Metadata = { title: "Public opinions" };
export const instant = false;

const PHASES: PollPhase[] = ["active", "upcoming", "draft", "closed", "archived"];

function requestTime(): Date {
  return new Date();
}

export default async function PollsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 100) : "");
  const phase = (PHASES as string[]).includes(one("phase")) ? (one("phase") as PollPhase) : undefined;
  const filter: PollListFilter = { q: one("q"), phase, deleted: one("bin") === "1", page: Math.min(Math.max(Number.parseInt(one("page"), 10) || 1, 1), 1000) };
  const now = requestTime();
  const list = await listPolls(filter, now);
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const k of ["q", "phase", "bin"]) if (one(k)) params.set(k, one(k));
    if (p > 1) params.set("page", String(p));
    return `/admin/polls${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title={filter.deleted ? "Polls in the bin" : "Public opinions"}>
        {filter.deleted ? (
          <Link href="/admin/polls" className={buttonSecondary + " inline-flex items-center"}>Back to polls</Link>
        ) : (
          <>
            <Link href="/admin/comments" className={buttonSecondary + " inline-flex items-center"}>Comments</Link>
            <Link href="/admin/polls?bin=1" className={buttonSecondary + " inline-flex items-center"}>Bin</Link>
            <Link href="/admin/polls/new" className={buttonPrimary + " inline-flex items-center"}>New poll</Link>
          </>
        )}
      </PageHeader>
      {one("binned") === "1" && <Notice>The poll was moved to the bin and removed from the site. Its votes are kept; you can restore it from the bin.</Notice>}

      <form method="get" role="search" className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4">
        {filter.deleted && <input type="hidden" name="bin" value="1" />}
        <label className="text-sm font-semibold">
          Question or slug contains
          <input name="q" defaultValue={filter.q} maxLength={100} className={inputClass + " font-sans"} />
        </label>
        {!filter.deleted && (
          <label className="text-sm font-semibold">
            Status
            <select name="phase" defaultValue={phase ?? ""} className={inputClass}>
              <option value="">Any</option>
              {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className={buttonPrimary}>Filter</button>
      </form>

      <div className="overflow-x-auto rounded-lg bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Question</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Voting period</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Votes</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Comments waiting</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No polls match.</td></tr>
            )}
            {list.rows.map((p) => (
              <tr key={p.id} className="border-b border-line align-top last:border-0">
                <td className="max-w-md px-4 py-3">
                  {filter.deleted ? (
                    <div className="flex flex-col gap-2">
                      <LocaleText locale="si" className="font-semibold">{p.question.si ?? p.question.en}</LocaleText>
                      <form action={pollStateAction}>
                        <input type="hidden" name="pollId" value={p.id} />
                        <input type="hidden" name="action" value="restore" />
                        <button type="submit" className={buttonSecondary}>Restore</button>
                      </form>
                    </div>
                  ) : (
                    <Link href={`/admin/polls/${p.id}`} className="font-semibold text-navy hover:underline">
                      <LocaleText locale="si">{p.question.si ?? p.question.en}</LocaleText>
                    </Link>
                  )}
                  {!p.question.en && <p className="mt-1 text-xs text-muted">Sinhala edition only</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PHASE_STYLE[p.phase]}`}>{PHASE_LABEL[p.phase]}</span>
                  {p.isHidden && <span className="ml-1 rounded bg-[#fdecee] px-2 py-0.5 text-xs font-semibold text-brand-dark">Hidden</span>}
                </td>
                <td className="px-4 py-3 text-muted">
                  {formatDateTime(p.startsAt.toISOString(), "en")}
                  <br />→ {formatDateTime(p.endsAt.toISOString(), "en")}
                </td>
                <td className="px-4 py-3 text-right">{p.votes.toLocaleString("en-US")}</td>
                <td className="px-4 py-3 text-right">
                  {p.pendingComments > 0 ? (
                    <Link href={`/admin/comments?poll=${p.id}`} className="font-semibold text-navy hover:underline">{p.pendingComments}</Link>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={list.page} pages={list.pages} href={href} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { getPollForEdit, getPollReport, POLL_LIMITS } from "@/server/admin/polls";
import { pollStateAction, reopenPollAction } from "@/server/admin/poll-actions";
import { getMediaItems, listMedia } from "@/server/media/core";
import { PollForm } from "@/components/admin/PollForm";
import type { PickerImage } from "@/components/admin/MediaPicker";
import { Notice, buttonDanger, buttonSecondary, inputClass } from "@/components/admin/ui";
import { EVENT_LABEL, PHASE_LABEL, PHASE_STYLE } from "@/components/admin/poll-labels";
import { formatDateTime, toColomboInput } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Poll" };
export const instant = false;

const DONE: Record<string, string> = {
  close: "Voting is closed. Results are now shown to everyone.",
  reopen: "Voting is open again until the new closing time.",
  archive: "The poll is archived.",
  unarchive: "The poll is out of the archive (closed).",
  hide: "The poll is hidden from the site. Its votes are kept.",
  show: "The poll is visible on the site again.",
  unpublish: "The poll is back to draft and no longer on the site.",
  restore: "The poll was restored from the bin.",
};

function requestTime(): Date {
  return new Date();
}

export default async function PollPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const now = requestTime();
  const poll = await getPollForEdit(id, now);
  if (!poll) notFound();
  const [report, recent, featured] = await Promise.all([
    getPollReport(id),
    listMedia({ take: 30 }),
    getMediaItems(poll.featuredMediaId ? [poll.featuredMediaId] : []),
  ]);
  const toPicker = (m: (typeof recent.items)[number]): PickerImage => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, alt: m.altEn || m.altSi });
  const images = [...featured.map(toPicker), ...recent.items.filter((m) => m.id !== poll.featuredMediaId).map(toPicker)];
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  const r = report!;
  const question = poll.translations.si?.question ?? poll.translations.en?.question ?? "";
  const live = poll.status !== "DRAFT" && !poll.isHidden && !poll.deletedAt;
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.votes));

  const stateButton = (action: string, label: string, opts: { danger?: boolean; confirm?: string } = {}) => (
    <form action={pollStateAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="pollId" value={poll.id} />
      <input type="hidden" name="action" value={action} />
      {opts.confirm && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" required /> {opts.confirm}
        </label>
      )}
      <button type="submit" className={opts.danger ? buttonDanger : buttonSecondary}>{label}</button>
    </form>
  );

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <Link href="/admin/polls" className="text-sm font-semibold text-navy hover:underline">← Public opinions</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 lang="si" className="font-sans text-2xl font-bold">{question}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PHASE_STYLE[poll.phase]}`}>{PHASE_LABEL[poll.phase]}</span>
        {poll.isHidden && <span className="rounded bg-[#fdecee] px-2 py-0.5 text-xs font-semibold text-brand-dark">Hidden</span>}
        {poll.deletedAt && <span className="rounded bg-[#fdecee] px-2 py-0.5 text-xs font-semibold text-brand-dark">In the bin</span>}
      </div>
      <p className="text-sm text-muted">
        {formatDateTime(poll.startsAt.toISOString(), "en")} → {formatDateTime(poll.endsAt.toISOString(), "en")} (Sri Lanka time)
        {live && (
          <>
            {" · "}
            <a href={`/si/public-opinions/${poll.slug}`} target="_blank" rel="noopener" className="font-semibold text-navy hover:underline">View on the site ↗</a>
          </>
        )}
      </p>
      {sp.created === "1" && <Notice>The poll was created as a draft.</Notice>}
      {done && <Notice>{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {poll.deletedAt ? (
        <section className="rounded-lg bg-white p-5">
          <p>This poll is in the bin and not on the site. Its {poll.totalVotes} vote(s) are kept.</p>
          <div className="mt-3">{stateButton("restore", "Restore")}</div>
        </section>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-lg bg-white p-5" aria-labelledby="results-heading">
              <h2 id="results-heading" className="text-lg font-bold">Results · {r.total.toLocaleString("en-US")} vote{r.total === 1 ? "" : "s"}</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {r.options.map((o) => (
                  <li key={o.id}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span lang="si" className="font-sans font-semibold">{o.si}{o.en ? <span className="font-latin font-normal text-muted"> · {o.en}</span> : null}</span>
                      <span className="shrink-0 font-semibold">{o.percent}% · {o.votes.toLocaleString("en-US")}</span>
                    </div>
                    <div className="mt-1 h-3 rounded bg-soft" aria-hidden="true">
                      <div className="h-3 rounded bg-navy" style={{ width: `${o.percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-muted">Anonymous</dt><dd className="text-lg font-bold">{r.identity.anonymous}</dd></div>
                <div><dt className="text-muted">With a code name</dt><dd className="text-lg font-bold">{r.identity.codeName}</dd></div>
                <div><dt className="text-muted">From Sinhala / English pages</dt><dd className="text-lg font-bold">{r.editions.si} / {r.editions.en}</dd></div>
                <div><dt className="text-muted">From new devices</dt><dd className="text-lg font-bold">{r.freshDevices}</dd></div>
              </dl>
              {r.byDay.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Votes per day</h3>
                  <ul className="mt-2 flex h-28 items-end gap-1" aria-label="Votes per day">
                    {r.byDay.slice(-30).map((d) => (
                      <li key={d.day} className="flex max-w-10 flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.votes}`}>
                        <span className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (d.votes / maxDay) * 96)}px` }} />
                        <span className="sr-only">{d.day}: {d.votes}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 flex justify-between text-xs text-muted"><span>{r.byDay[Math.max(0, r.byDay.length - 30)].day}</span><span>{r.byDay[r.byDay.length - 1].day}</span></p>
                </div>
              )}
              <p className="mt-4 text-xs text-muted">Counted directly from the stored votes. No voter or device details are shown or kept in readable form.</p>
            </section>

            <aside className="flex flex-col gap-4">
              <section className="rounded-lg bg-white p-4">
                <h2 className="font-bold">Comments</h2>
                <p className="mt-1 text-sm">{r.comments.PENDING} waiting · {r.comments.APPROVED} approved · {r.comments.HIDDEN} hidden</p>
                <Link href={`/admin/comments?poll=${poll.id}`} className="mt-2 inline-block text-sm font-semibold text-navy hover:underline">Moderate comments →</Link>
              </section>
              <section className="rounded-lg bg-white p-4">
                <h2 className="font-bold">Blocked voting attempts</h2>
                {r.rejected.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">None.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {r.rejected.map((e) => <li key={e.type} className="flex justify-between gap-2"><span>{EVENT_LABEL[e.type] ?? e.type}</span><span className="font-semibold">{e.count}</span></li>)}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted">These attempts were refused and never counted.</p>
              </section>
              <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
                <h2 className="font-bold">Controls</h2>
                {(poll.phase === "active" || poll.phase === "upcoming") && stateButton("close", "Close voting now", { danger: true, confirm: "Yes, close voting" })}
                {poll.phase === "closed" && (
                  <form action={reopenPollAction} className="flex flex-col gap-2">
                    <input type="hidden" name="pollId" value={poll.id} />
                    <label className="text-sm font-semibold">
                      Reopen voting until (Sri Lanka time)
                      <input type="datetime-local" name="endsAt" required defaultValue={toColomboInput(new Date(now.getTime() + 86_400_000))} className={inputClass + " font-normal"} />
                    </label>
                    <button type="submit" className={buttonSecondary}>Reopen voting</button>
                  </form>
                )}
                {poll.phase === "closed" && stateButton("archive", "Archive")}
                {poll.phase === "archived" && stateButton("unarchive", "Take out of the archive")}
                {poll.status !== "DRAFT" && (poll.isHidden ? stateButton("show", "Show on the site") : stateButton("hide", "Hide from the site"))}
                {poll.status !== "DRAFT" && poll.totalVotes === 0 && stateButton("unpublish", "Back to draft")}
                <div className="border-t border-line pt-3">
                  {stateButton("bin", "Move to bin", { danger: true, confirm: "Yes, remove it from the site" })}
                  <p className="mt-1 text-xs text-muted">Votes are kept; it can be restored.</p>
                </div>
              </section>
            </aside>
          </div>

          <h2 className="mt-2 text-xl font-bold">Edit</h2>
          <PollForm
            // Remount after a control above changed the poll, so the form starts from the new version.
            key={`${poll.id}-${typeof sp.t === "string" ? sp.t.slice(0, 20) : ""}`}
            poll={{
              id: poll.id,
              updatedAt: poll.updatedAt.toISOString(),
              status: poll.status,
              slug: poll.slug,
              startsAt: toColomboInput(poll.startsAt),
              endsAt: toColomboInput(poll.endsAt),
              resultsVisibility: poll.resultsVisibility,
              featuredMediaId: poll.featuredMediaId,
              locked: poll.locked,
              si: poll.translations.si ?? { question: "", description: "", seoTitle: "", metaDescription: "" },
              en: poll.translations.en ?? { question: "", description: "", seoTitle: "", metaDescription: "" },
              options: poll.options,
            }}
            images={images}
            limits={POLL_LIMITS}
          />
        </>
      )}
    </div>
  );
}

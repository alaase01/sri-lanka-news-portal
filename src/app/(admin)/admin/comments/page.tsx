import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listComments, pollOptionsForFilter, type CommentFilter } from "@/server/admin/polls";
import { moderateCommentsAction } from "@/server/admin/poll-actions";
import { formatDateTime } from "@/lib/utils/dates";
import { Notice, PageHeader, Pager, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";
import { SelectAll } from "@/components/admin/SelectAll";

export const metadata: Metadata = { title: "Comments" };
export const instant = false;

const STATUSES = [
  { value: "PENDING", label: "Waiting for approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "HIDDEN", label: "Hidden" },
] as const;

const DONE: Record<string, string> = { APPROVED: "approved and now shown on the site", HIDDEN: "hidden", PENDING: "returned to the queue" };

export default async function CommentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 60) : "");
  const status = (STATUSES.map((s) => s.value) as string[]).includes(one("status")) ? (one("status") as CommentFilter["status"]) : one("status") === "all" ? undefined : "PENDING";
  const pollId = /^[a-z0-9]{1,40}$/i.test(one("poll")) ? one("poll") : undefined;
  const filter: CommentFilter = { status, pollId, flaggedOnly: one("flagged") === "1", page: Math.min(Math.max(Number.parseInt(one("page"), 10) || 1, 1), 1000) };
  const [list, polls] = await Promise.all([listComments(filter), pollOptionsForFilter()]);

  const params = new URLSearchParams();
  if (one("status")) params.set("status", one("status"));
  if (pollId) params.set("poll", pollId);
  if (filter.flaggedOnly) params.set("flagged", "1");
  const returnTo = `/admin/comments${params.size ? `?${params}` : ""}`;
  const pageHref = (p: number) => {
    const q = new URLSearchParams(params);
    if (p > 1) q.set("page", String(p));
    return `/admin/comments${q.size ? `?${q}` : ""}`;
  };
  const moderated = one("moderated");
  const n = Number.parseInt(one("n"), 10) || 0;

  const decisionButtons = (form?: string) => (
    <>
      {status !== "APPROVED" && <button type="submit" form={form} name="decision" value="APPROVED" className={buttonPrimary}>Approve</button>}
      {status !== "HIDDEN" && <button type="submit" form={form} name="decision" value="HIDDEN" className={buttonSecondary}>Hide</button>}
      {status && status !== "PENDING" && <button type="submit" form={form} name="decision" value="PENDING" className={buttonSecondary}>Back to queue</button>}
    </>
  );

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Comments">
        <Link href="/admin/polls" className={buttonSecondary + " inline-flex items-center"}>Public opinions</Link>
      </PageHeader>
      <p className="text-body">Readers&rsquo; comments appear on the site only after you approve them. Hiding a comment never affects the vote it came with.</p>
      {moderated && moderated !== "none" && DONE[moderated] && <Notice>{n} comment{n === 1 ? "" : "s"} {DONE[moderated]}.</Notice>}
      {moderated === "none" && <Notice tone="error">Select at least one comment first.</Notice>}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4">
        <label className="text-sm font-semibold">
          Show
          <select name="status" defaultValue={status ?? "all"} className={inputClass}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="all">All comments</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Poll
          <select name="poll" defaultValue={pollId ?? ""} className={inputClass + " max-w-xs font-sans"}>
            <option value="">All polls</option>
            {polls.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" name="flagged" value="1" defaultChecked={filter.flaggedOnly} /> Flagged only
        </label>
        <button type="submit" className={buttonPrimary}>Show</button>
      </form>

      <form id="bulk" action={moderateCommentsAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="returnTo" value={returnTo} />
        {list.items.length > 0 && (
          <>
            <SelectAll form="bulk" label="Select all on this page" />
            <span className="text-sm text-muted">With selected:</span>
            {decisionButtons()}
          </>
        )}
        <span className="ml-auto text-sm text-muted">{list.total} comment{list.total === 1 ? "" : "s"}</span>
      </form>

      {list.items.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-muted">{status === "PENDING" ? "Nothing is waiting for approval." : "No comments match."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((c) => (
            <li key={c.id} className={"rounded-lg bg-white p-4 " + (c.flagged ? "ring-2 ring-notice-ink/40" : "")}>
              <div className="flex flex-wrap items-start gap-3">
                <input type="checkbox" form="bulk" name="commentId" value={c.id} aria-label="Select this comment" className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{c.name ? <span className="font-sans">{c.name}</span> : "Anonymous"}</span>
                    <span className="text-muted">· {formatDateTime(c.createdAt.toISOString(), "en")}</span>
                    {c.flagged && <span className="rounded bg-notice px-2 py-0.5 text-xs font-semibold text-notice-ink" title="Contains a link or repeated text">Flagged for a closer look</span>}
                    {c.status !== "PENDING" && <span className="rounded bg-soft px-2 py-0.5 text-xs font-semibold">{c.status === "APPROVED" ? "Approved" : "Hidden"}</span>}
                  </p>
                  {/* Plain text: React escapes it, and nothing here is parsed as HTML or links. */}
                  <p lang="si" className="mt-2 whitespace-pre-wrap break-words font-sans">{c.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    On <Link href={`/admin/polls/${c.pollId}`} className="font-sans font-semibold text-navy hover:underline">{c.pollQuestion}</Link> · voted for <span className="font-sans">{c.answer}</span>
                  </p>
                </div>
                <form action={moderateCommentsAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="commentId" value={c.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {decisionButtons()}
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pages={list.pages} href={pageHref} />
    </div>
  );
}

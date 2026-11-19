import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { dashboard } from "@/server/newsroom/service";
import { markNoticesReadAction, runNowAction, setEnabledAction, setMaxStoriesAction } from "@/server/newsroom/actions";
import { NEWSROOM_LIMITS } from "@/server/newsroom/config";
import { formatDateTime } from "@/lib/utils/dates";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { Notice, PageHeader, buttonPrimary, buttonSecondary, inputClass } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Automated Global Newsroom" };
export const instant = false;

function requestTime(): Date {
  return new Date();
}

const when = (d: Date | null | undefined) => (d ? `${formatDateTime(d.toISOString(), "en")} (Sri Lanka time)` : "—");

const DONE: Record<string, string> = {
  started: "Run started. This page refreshes on its own; a run usually takes a few minutes.",
  enabled: "Scheduled runs switched on.",
  paused: "Scheduled runs paused.",
  saved: "Saved.",
  discarded: "Story discarded.",
  read: "Notifications marked as read.",
};

const RISK_TONE: Record<string, string> = { LOW: "bg-[#e3f3e8] text-[#1d5b33]", MEDIUM: "bg-notice text-notice-ink", HIGH: "bg-brand-dark text-white" };

export default async function NewsroomPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const d = await dashboard(requestTime());
  const b = d.budget;
  const pct = Math.round((b.spent / Math.max(b.limit, 0.01)) * 100);

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <AutoRefresh active={d.running} />
      <PageHeader title="Automated Global Newsroom" />
      <p className="max-w-3xl text-body">
        Researches significant world news from trusted sources and prepares original English and Sinhala articles as <strong>drafts</strong> in the World
        section. It never publishes. Review every draft (facts, sources and wording) before publishing. Automated checks reduce copyright and accuracy risk
        but are not legal advice and do not guarantee compliance.
      </p>
      {typeof sp.done === "string" && DONE[sp.done] && <Notice>{DONE[sp.done]}</Notice>}
      {typeof sp.error === "string" && <Notice tone="error">{sp.error.slice(0, 300)}</Notice>}
      {!d.worldFound && <Notice tone="error">The World category (English slug &quot;world&quot;) was not found. Runs cannot create drafts until it exists.</Notice>}
      {pct >= 100 ? (
        <Notice tone="error">The monthly AI budget is used up (USD {b.spent.toFixed(2)} of {b.limit.toFixed(2)}). New AI work is stopped.</Notice>
      ) : pct >= 75 ? (
        <Notice>
          {pct}% of the monthly AI budget is used (USD {b.spent.toFixed(2)} of {b.limit.toFixed(2)}).
        </Notice>
      ) : null}

      {/* A. Status and controls */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Status">
        <div className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">Automation</h2>
          <p>
            Scheduled runs:{" "}
            <strong className={d.enabled ? "text-[#1d5b33]" : "text-brand-dark"}>{d.enabled ? "On" : "Off (paused)"}</strong>
            {d.running && <span className="ml-2 rounded bg-navy px-2 py-0.5 text-xs font-semibold text-white">Running now…</span>}
          </p>
          <p>Schedule: 00:00, 06:00, 12:00 and 18:00, Asia/Colombo</p>
          <p>Next run: {d.enabled ? when(d.nextRun) : "— (switched off)"}</p>
          <p>Last successful run: {when(d.lastSuccess)}</p>
          <p>
            Last attempt: {when(d.lastAttempt?.startedAt)} {d.lastAttempt && <span className="text-muted">({d.lastAttempt.status.toLowerCase()})</span>}
          </p>
          <p>Completed runs: {d.completedRuns}</p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">Controls</h2>
          <form action={runNowAction}>
            <button type="submit" disabled={d.running} className={buttonPrimary}>
              {d.running ? "A run is in progress" : "Run now"}
            </button>
          </form>
          <p className="text-muted">Run now also works while scheduling is off; use it for the first manual test.</p>
          <form action={setEnabledAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="enabled" value={d.enabled ? "off" : "on"} />
            <button type="submit" className={buttonSecondary} disabled={!d.enabled && !d.canEnable}>
              {d.enabled ? "Pause scheduled runs" : "Switch on scheduled runs"}
            </button>
            {!d.enabled && !d.canEnable && <span className="text-xs text-muted">Available after one successful manual run.</span>}
          </form>
          <form action={setMaxStoriesAction} className="flex flex-wrap items-end gap-2">
            <label className="font-semibold">
              Stories per run (max)
              <input name="maxStories" type="number" min={1} max={NEWSROOM_LIMITS.maxStoriesCeiling} defaultValue={d.maxStoriesPerRun} className={inputClass + " w-24"} />
            </label>
            <button type="submit" className={buttonSecondary}>Save</button>
          </form>
        </div>

        <div className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">AI budget this month</h2>
          <p className="text-2xl font-bold">
            USD {b.spent.toFixed(2)} <span className="text-base font-normal text-muted">of {b.limit.toFixed(2)}</span>
          </p>
          <div className="h-2 w-full overflow-hidden rounded bg-soft" role="img" aria-label={`${pct}% used`}>
            <div className={`h-full ${pct >= 90 ? "bg-brand-dark" : pct >= 75 ? "bg-[#c9a227]" : "bg-navy"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="text-muted">
            All AI use on the site counts (newsroom and Editorial Assistant), Sri Lanka calendar month, estimated from real usage. Warnings at 75% and 90%;
            work stops at 100%. Change the limit in <Link href="/admin/settings" className="underline">Settings</Link>.
          </p>
        </div>
      </section>

      {/* Notifications */}
      <section className="flex flex-col gap-2 rounded-lg bg-white p-4" aria-labelledby="notices">
        <div className="flex items-center justify-between gap-2">
          <h2 id="notices" className="text-base font-bold">
            Notifications {d.unread > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{d.unread} new</span>}
          </h2>
          {d.unread > 0 && (
            <form action={markNoticesReadAction}>
              <button type="submit" className="text-sm font-semibold text-navy hover:underline">Mark all as read</button>
            </form>
          )}
        </div>
        {d.notices.length === 0 ? (
          <p className="text-sm text-muted">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.notices.map((n) => (
              <li key={n.id} className={`flex gap-3 py-2 ${n.readAt ? "text-muted" : ""}`}>
                <span className={`w-16 shrink-0 text-xs font-bold uppercase ${n.level === "error" ? "text-brand-dark" : n.level === "warning" ? "text-notice-ink" : "text-navy"}`}>{n.level}</span>
                <span className="flex-1">{n.message}</span>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(n.createdAt.toISOString(), "en")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Held for review */}
      {d.held.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg bg-white p-4" aria-labelledby="held">
          <h2 id="held" className="text-base font-bold">Held for review ({d.held.length})</h2>
          <p className="text-sm text-muted">Not in the drafts list. Open each to see the concerns, then create drafts or discard.</p>
          <ul className="divide-y divide-line text-sm">
            {d.held.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${RISK_TONE[s.copyrightRisk ?? "MEDIUM"]}`}>{s.copyrightRisk ?? "—"}</span>
                <Link href={`/admin/newsroom/stories/${s.id}`} className="flex-1 font-semibold text-navy hover:underline">{s.enHeadline ?? s.topic}</Link>
                <span className="text-xs text-muted">{formatDateTime(s.createdAt.toISOString(), "en")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* C. Drafts */}
      <section className="flex flex-col gap-2 rounded-lg bg-white p-4" aria-labelledby="drafts">
        <h2 id="drafts" className="text-base font-bold">Generated drafts</h2>
        {d.stories.length === 0 ? (
          <p className="text-sm text-muted">No drafts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="p-2">Headlines</th>
                  <th scope="col" className="p-2">Created</th>
                  <th scope="col" className="p-2">Sources</th>
                  <th scope="col" className="p-2">Verification</th>
                  <th scope="col" className="p-2">Copyright</th>
                  <th scope="col" className="p-2">Words EN / SI</th>
                  <th scope="col" className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.stories.map((s) => {
                  const sources = ((s.research as { sources?: unknown[] })?.sources ?? []).length;
                  const a = s.article;
                  const status = !a ? "Deleted" : a.deletedAt ? "In the bin" : a.translations.map((t) => `${t.locale.toUpperCase()}: ${t.status.toLowerCase()}`).join(", ");
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="p-2">
                        <Link href={`/admin/newsroom/stories/${s.id}`} className="font-semibold text-navy hover:underline">{s.enHeadline}</Link>
                        <div lang="si" className="font-sinhala">{s.siHeadline}</div>
                        {a && !a.deletedAt && (
                          <div className="mt-1 flex gap-3 text-xs">
                            <Link href={`/admin/articles/${a.id}/en`} className="underline">Open English draft</Link>
                            <Link href={`/admin/articles/${a.id}/si`} className="underline">Open Sinhala draft</Link>
                          </div>
                        )}
                      </td>
                      <td className="p-2">{formatDateTime(s.createdAt.toISOString(), "en")}</td>
                      <td className="p-2">{sources}</td>
                      <td className="p-2">{s.verification}</td>
                      <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${RISK_TONE[s.copyrightRisk ?? "LOW"]}`}>{s.copyrightRisk}</span></td>
                      <td className="p-2">{s.enWords} / {s.siWords}</td>
                      <td className="p-2">{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Research records: every story considered, with the reason for the decision */}
      <section className="flex flex-col gap-2 rounded-lg bg-white p-4" aria-labelledby="records">
        <h2 id="records" className="text-base font-bold">Research records (latest 40)</h2>
        {d.records.length === 0 ? (
          <p className="text-sm text-muted">Nothing researched yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.records.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-3 py-2">
                <span className="w-20 shrink-0 text-xs font-bold uppercase text-muted">{s.status.toLowerCase()}</span>
                <Link href={`/admin/newsroom/stories/${s.id}`} className="flex-1 font-semibold text-navy hover:underline">{s.enHeadline ?? s.topic}</Link>
                {s.reason && <span className="w-full pl-24 text-xs text-muted sm:w-auto sm:pl-0">{s.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* B. Run history */}
      <section className="flex flex-col gap-2 rounded-lg bg-white p-4" aria-labelledby="runs">
        <h2 id="runs" className="text-base font-bold">Run history</h2>
        {d.runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet. Use “Run now” for a first manual test.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="p-2">Started</th>
                  <th scope="col" className="p-2">Type</th>
                  <th scope="col" className="p-2">Status</th>
                  <th scope="col" className="p-2" title="Found / selected">Found / sel.</th>
                  <th scope="col" className="p-2">Duplicates</th>
                  <th scope="col" className="p-2">Too little evidence</th>
                  <th scope="col" className="p-2">Copyright</th>
                  <th scope="col" className="p-2">Drafted</th>
                  <th scope="col" className="p-2">Held</th>
                  <th scope="col" className="p-2">Failed</th>
                  <th scope="col" className="p-2">Cost (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.runs.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="p-2">{formatDateTime(r.startedAt.toISOString(), "en")}</td>
                    <td className="p-2">{r.trigger === "manual" ? "Manual" : "Scheduled"}{r.attempt > 1 ? ` (try ${r.attempt})` : ""}</td>
                    <td className="p-2">
                      <span className={r.status === "FAILED" ? "font-semibold text-brand-dark" : r.status === "RUNNING" ? "font-semibold text-navy" : ""}>{r.status.toLowerCase()}</span>
                      {r.message && <div className="text-xs text-muted">{r.message}</div>}
                    </td>
                    <td className="p-2">{r.discovered} / {r.selected}</td>
                    <td className="p-2">{r.duplicates}</td>
                    <td className="p-2">{r.insufficient}</td>
                    <td className="p-2">{r.copyright}</td>
                    <td className="p-2 font-semibold">{r.drafted}</td>
                    <td className="p-2">{r.held}</td>
                    <td className="p-2">{r.failed}</td>
                    <td className="p-2">{Number(r.costUsd).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

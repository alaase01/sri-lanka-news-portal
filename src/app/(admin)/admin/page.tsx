import type { Metadata } from "next";
import { formatDateTime } from "@/lib/utils/dates";
import { getDashboard } from "@/server/admin/dashboard";
import { requireAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };
export const instant = false;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  HIDDEN: "Hidden",
  ARCHIVED: "Archived",
};

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_blocked": "Sign-in blocked after repeated failures",
  "auth.admin_created": "Administrator created",
  "auth.credentials_reset": "Email or password reset",
};

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-lg bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value.toLocaleString("en-US")}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  // The layout already checks, but every page checks again: layouts are not a security boundary.
  await requireAdmin();
  const d = await getDashboard(new Date());
  const published = d.articles.find((a) => a.status === "PUBLISHED");

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Published articles (Sinhala)" value={published?.si ?? 0} />
        <Stat label="Published articles (English)" value={published?.en ?? 0} />
        <Stat label="Categories" value={d.categories} />
        <Stat label="Tags" value={d.tags} />
        <Stat label="Active polls" value={d.polls.active} note={`${d.polls.upcoming} upcoming · ${d.polls.closed} closed`} />
        <Stat label="Total votes" value={d.polls.votes} />
        <Stat label="Comments awaiting approval" value={d.pendingComments} note={d.flaggedComments ? `${d.flaggedComments} flagged for a closer look` : undefined} />
        <Stat label="Rejected voting attempts, last 24 hours" value={d.suspicious24h} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-5">
          <h2 className="text-lg font-bold">Articles by status</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 font-semibold">Status</th>
                <th scope="col" className="py-2 text-right font-semibold">Sinhala</th>
                <th scope="col" className="py-2 text-right font-semibold">English</th>
              </tr>
            </thead>
            <tbody>
              {d.articles.map((row) => (
                <tr key={row.status} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 font-normal">{STATUS_LABEL[row.status]}</th>
                  <td className="py-2 text-right">{row.si}</td>
                  <td className="py-2 text-right">{row.en}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.dueScheduled > 0 && (
            <p className="mt-3 text-sm text-muted">{d.dueScheduled} scheduled translation(s) have passed their time and are now public.</p>
          )}
        </section>

        <section className="rounded-lg bg-white p-5">
          <h2 className="text-lg font-bold">Most viewed, last 7 days</h2>
          {d.mostViewed.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No views recorded yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {d.mostViewed.map((a, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                  <span className="font-sans">{a.headline}</span>
                  <span className="shrink-0 text-muted">{a.views.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">View counting is not built yet; these figures come from the demo data.</p>
        </section>
      </div>

      <section className="rounded-lg bg-white p-5">
        <h2 className="text-lg font-bold">Recent activity</h2>
        {d.activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 font-semibold">When (Sri Lanka time)</th>
                <th scope="col" className="py-2 font-semibold">What</th>
                <th scope="col" className="py-2 font-semibold">From</th>
              </tr>
            </thead>
            <tbody>
              {d.activity.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(a.at, "en")}</td>
                  <td className="py-2 pr-4">{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td className="py-2 text-muted">{a.ip ?? "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

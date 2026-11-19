import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/session";
import { storyDetail } from "@/server/newsroom/service";
import { approveHeldAction, discardHeldAction } from "@/server/newsroom/actions";
import type { ResearchRecord, Written } from "@/server/newsroom/pipeline";
import { formatDateTime } from "@/lib/utils/dates";
import { cleanBody, emptyBody } from "@/lib/content/body";
import { ArticleBody } from "@/components/article/ArticleBody";
import { Notice, buttonDanger, buttonPrimary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Newsroom research record" };
export const instant = false;

const KIND_LABEL: Record<string, string> = { confirmed: "Confirmed", official: "Official statement", allegation: "Allegation", opinion: "Opinion", unverified: "Unverified" };

/** Shows a source URL as text with a link that does not pass on the admin page as referrer. */
function SourceLink({ url }: { url: string }) {
  const safe = /^https?:\/\//i.test(url) ? url : null;
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-navy underline">{safe}</a>
  ) : (
    <span className="break-all">{url}</span>
  );
}

export default async function StoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const story = await storyDetail(id);
  if (!story) notFound();
  const sp = await searchParams;
  const r = story.research as Partial<ResearchRecord> & { screen?: { longestRun: number; sharedShingles: number; quotedWords: number } };
  const held = story.status === "HELD" ? (story.heldContent as unknown as Written | null) : null;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/admin/newsroom" className="text-sm font-semibold text-navy hover:underline">← Automated Global Newsroom</Link>
      <h1 className="text-2xl font-bold">{story.enHeadline ?? story.topic}</h1>
      {sp.done === "drafted" && <Notice>Drafts created in the World section. They are not published.</Notice>}
      {typeof sp.error === "string" && <Notice tone="error">{sp.error.slice(0, 300)}</Notice>}

      <section className="grid gap-2 rounded-lg bg-white p-4 text-sm sm:grid-cols-2">
        <p>Status: <strong>{story.status.toLowerCase()}</strong>{story.reason && <span className="block text-muted">{story.reason}</span>}</p>
        <p>Run: {story.run.slotKey.startsWith("manual") ? "manual" : story.run.slotKey} · {formatDateTime(story.createdAt.toISOString(), "en")}</p>
        <p>Verification: {story.verification || "—"}</p>
        <p>Copyright risk: <strong>{story.copyrightRisk ?? "—"}</strong></p>
        <p>Words: English {story.enWords ?? "—"}, Sinhala {story.siWords ?? "—"}</p>
        <p>Model: {story.model ?? "—"}</p>
        {story.articleId && (
          <p className="sm:col-span-2">
            Drafts: <Link href={`/admin/articles/${story.articleId}/en`} className="underline">English</Link> ·{" "}
            <Link href={`/admin/articles/${story.articleId}/si`} className="underline">Sinhala</Link>
          </p>
        )}
      </section>

      {story.copyrightNotes && (
        <section className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">Copyright and accuracy screen</h2>
          <ul className="list-disc pl-5">
            {story.copyrightNotes.split("\n").map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {r.screen && (
            <p className="text-muted">
              Longest passage shared with a source: {r.screen.longestRun} words · shared 8-word phrases: {Math.round(r.screen.sharedShingles * 100)}% · quoted words: {r.screen.quotedWords}
            </p>
          )}
          <p className="text-muted">Automated screening reduces risk but is not legal advice and does not guarantee compliance. An editor must review before publishing.</p>
        </section>
      )}

      {held && (
        <section className="flex flex-col gap-3 rounded-lg border-2 border-navy bg-white p-4">
          <h2 className="text-base font-bold">Held text (not in the drafts list)</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["en", "si"] as const).map((l) => (
              <article key={l} lang={l} className="flex flex-col gap-2">
                <h3 className="font-bold">{held[l].headline}</h3>
                <p className="text-sm text-muted">{held[l].seoDescription}</p>
                <div className="article-body"><ArticleBody body={cleanBody(held[l].body) ?? emptyBody()} /></div>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={approveHeldAction}>
              <input type="hidden" name="storyId" value={story.id} />
              <button type="submit" className={buttonPrimary}>I have reviewed it: create drafts</button>
            </form>
            <form action={discardHeldAction}>
              <input type="hidden" name="storyId" value={story.id} />
              <button type="submit" className={buttonDanger}>Discard</button>
            </form>
          </div>
          <p className="text-xs text-muted">Creating drafts does not publish anything. You can still edit or delete the drafts.</p>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
        <h2 className="text-base font-bold">Sources ({r.sources?.length ?? r.candidate?.sources.length ?? 0})</h2>
        <ul className="flex flex-col gap-2">
          {(r.sources ?? r.candidate?.sources.map((s) => ({ ...s, author: "", publishedAt: "", accessedAt: null })) ?? []).map((s, i) => (
            <li key={i}>
              <strong>{s.publisher}</strong>
              {s.author && ` · ${s.author}`}
              {s.publishedAt && ` · published ${s.publishedAt}`}
              {s.accessedAt && ` · read ${formatDateTime(s.accessedAt, "en")}`}
              <div><SourceLink url={s.url} /></div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Source links are for editors only and are never added to the published article automatically.</p>
      </section>

      {r.facts && (
        <section className="flex flex-col gap-2 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">Facts used ({r.facts.length})</h2>
          <ul className="flex flex-col gap-2">
            {r.facts.map((f, i) => (
              <li key={i}>
                <span className="mr-2 rounded bg-soft px-2 py-0.5 text-xs font-semibold">{KIND_LABEL[f.kind] ?? f.kind}</span>
                {f.statement} {f.attribution && <span className="text-muted">({f.attribution})</span>}
                <span className="text-xs text-muted"> · {f.sourceUrls.length} source{f.sourceUrls.length === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
          {!!r.quotes?.length && (
            <>
              <h3 className="font-bold">Quotations (checked word for word)</h3>
              <ul className="list-disc pl-5">
                {r.quotes.map((q, i) => (
                  <li key={i}>“{q.text}” — {q.speaker}</li>
                ))}
              </ul>
            </>
          )}
          {!!r.droppedQuotes?.length && <p className="text-muted">{r.droppedQuotes.length} quotation(s) were dropped because they could not be found word for word in a source.</p>}
          {!!r.conflicts?.length && (
            <>
              <h3 className="font-bold">Conflicting reports</h3>
              <ul className="list-disc pl-5">{r.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          {!!r.uncertainties?.length && (
            <>
              <h3 className="font-bold">Open questions</h3>
              <ul className="list-disc pl-5">{r.uncertainties.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
        </section>
      )}
      {r.candidate && (
        <section className="flex flex-col gap-1 rounded-lg bg-white p-4 text-sm">
          <h2 className="text-base font-bold">Why it was considered</h2>
          <p>{r.candidate.development}</p>
          <p className="text-muted">Importance {r.candidate.importance} of 5 · {r.candidate.eventTime} · {r.candidate.locations.join(", ")}</p>
        </section>
      )}
    </div>
  );
}

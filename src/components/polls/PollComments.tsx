"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { TimeAgo } from "@/components/news/TimeAgo";

type Comment = { id: string; name: string | null; body: string; createdAt: string };

/** Approved comments, loaded a page at a time. Text is rendered as text, never as HTML. */
export function PollComments({
  pollId,
  locale,
  labels,
}: {
  pollId: string;
  locale: Locale;
  labels: { comments: string; noComments: string; loadMore: string; loading: string; anonymous: string };
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = useCallback(
    async (after: string | null) => {
      const res = await fetch(`/api/polls/${pollId}/comments${after ? `?cursor=${after}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { comments: Comment[]; nextCursor: string | null };
    },
    [pollId],
  );

  // First page.
  useEffect(() => {
    let cancelled = false;
    request(null)
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments);
        setCursor(data.nextCursor);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const loadMore = async () => {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const data = await request(cursor);
      setComments((current) => [...current, ...data.comments]);
      setCursor(data.nextCursor);
    } catch {
      /* keep what is shown; the button stays for another try */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg bg-white p-5 sm:p-6">
      <h2 className="mb-3 text-xl font-bold">{labels.comments}</h2>
      {!loaded ? (
        <p className="text-muted" aria-busy="true">{labels.loading}</p>
      ) : comments.length === 0 ? (
        <p className="text-body">{labels.noComments}</p>
      ) : (
        <ul className="divide-y divide-line">
          {comments.map((c) => (
            <li key={c.id} className="py-4">
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-bold text-ink">{c.name ?? labels.anonymous}</span>
                <TimeAgo iso={c.createdAt} locale={locale} className="text-muted" />
              </p>
              <p className="mt-1.5 whitespace-pre-line break-words leading-relaxed text-ink">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button type="button" onClick={() => void loadMore()} disabled={busy} className="mt-3 min-h-11 rounded border border-navy px-4 font-semibold hover:bg-soft disabled:opacity-70">
          {busy ? labels.loading : labels.loadMore}
        </button>
      )}
    </section>
  );
}

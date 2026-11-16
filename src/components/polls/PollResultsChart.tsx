import type { PollResults } from "@/lib/polls/results";

/**
 * Horizontal bar chart drawn with plain HTML. Every bar carries its option
 * name, vote count and percentage as text, so the result is readable without
 * colour and by screen readers. No charting library.
 */
export function PollResultsChart({
  results,
  votedOptionId,
  labels,
}: {
  results: PollResults;
  votedOptionId: string | null;
  labels: { votes: string; totalVotes: string; youChose: string };
}) {
  const top = Math.max(...results.options.map((o) => o.votes), 0);
  return (
    <div>
      <ul className="flex flex-col gap-4">
        {results.options.map((o) => {
          const leading = results.total > 0 && o.votes === top;
          return (
            <li key={o.optionId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-semibold">
                  {o.label}
                  {o.optionId === votedOptionId && (
                    <span className="ml-2 rounded-sm bg-soft px-1.5 py-0.5 text-xs font-semibold text-navy">{labels.youChose}</span>
                  )}
                </span>
                <span className="font-latin text-sm text-body">
                  {o.votes.toLocaleString("en-US")} {labels.votes} · <strong className="text-ink">{o.percent}%</strong>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-4 overflow-hidden rounded-sm bg-soft">
                <div className={`h-full rounded-sm ${leading ? "bg-brand" : "bg-navy"}`} style={{ width: `${o.percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 border-t border-line pt-3 font-semibold">
        {labels.totalVotes}: <span className="font-latin">{results.total.toLocaleString("en-US")}</span>
      </p>
    </div>
  );
}

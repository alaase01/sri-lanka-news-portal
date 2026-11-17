import Link from "next/link";
import type { BreakingItem } from "@/server/services/content";

/** Headlines in one loop half; short lists are repeated so the loop always fills a wide bar. */
const MIN_PER_LOOP = 6;

/**
 * Breaking news ticker. Scrolls on its own whenever it has any headline,
 * pauses on hover or keyboard focus, and becomes a plain scrollable row when
 * the reader prefers reduced motion.
 *
 * The moving strip is two identical halves; the animation slides one half's
 * width and starts again, so the loop is seamless. Only the first copy of each
 * headline is announced to screen readers or reachable with the keyboard.
 */
export function Ticker({ items, label }: { items: BreakingItem[]; label: string }) {
  if (items.length === 0) return null;
  const repeats = Math.ceil(MIN_PER_LOOP / items.length);
  const half = Array.from({ length: repeats }, (_, r) => items.map((item) => ({ item, copy: r }))).flat();

  const row = (hidden: boolean, key: string) => (
    <ul key={key} aria-hidden={hidden || undefined} className={`flex shrink-0 items-center ${hidden ? "hidden motion-safe:flex" : ""}`}>
      {(hidden ? half : half.slice(0, items.length)).map(({ item, copy }) => (
        <li key={`${item.id}-${copy}`} className="flex items-center whitespace-nowrap">
          <Link href={item.href} tabIndex={hidden ? -1 : undefined} className="px-4 py-2.5 font-medium hover:text-brand-dark">
            {item.text}
          </Link>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
        </li>
      ))}
    </ul>
  );
  // Repeats of the first half (when the list is short), then the second identical half.
  const fillers = half.length > items.length ? (
    <ul aria-hidden="true" className="hidden shrink-0 items-center motion-safe:flex">
      {half.slice(items.length).map(({ item, copy }) => (
        <li key={`${item.id}-${copy}`} className="flex items-center whitespace-nowrap">
          <Link href={item.href} tabIndex={-1} className="px-4 py-2.5 font-medium hover:text-brand-dark">
            {item.text}
          </Link>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <section aria-label={label} className="flex items-stretch overflow-hidden rounded-md bg-white">
      <h2 className="flex shrink-0 items-center bg-brand px-4 text-sm font-bold text-white sm:text-base">{label}</h2>
      <div className="group min-w-0 flex-1 overflow-x-auto motion-safe:overflow-hidden">
        <div className="flex w-max motion-safe:animate-ticker motion-safe:group-focus-within:[animation-play-state:paused] motion-safe:group-hover:[animation-play-state:paused]">
          {row(false, "a")}
          {fillers}
          {row(true, "b")}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import type { BreakingItem } from "@/server/services/content";

/**
 * Breaking news ticker. Scrolls on its own, pauses on hover or keyboard focus,
 * and becomes a plain scrollable row when the reader prefers reduced motion.
 */
export function Ticker({ items, label }: { items: BreakingItem[]; label: string }) {
  if (items.length === 0) return null;
  // With only one or two headlines there is nothing to scroll: show them still.
  const scrolls = items.length >= 3;
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item) => (
        <li key={item.id} className="flex items-center whitespace-nowrap">
          <Link href={item.href} tabIndex={hidden ? -1 : undefined} className="px-4 py-2.5 font-medium hover:text-brand-dark">
            {item.text}
          </Link>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={label} className="flex items-stretch overflow-hidden rounded-md bg-white">
      <h2 className="flex shrink-0 items-center bg-brand px-4 text-sm font-bold text-white sm:text-base">{label}</h2>
      <div className={`group min-w-0 flex-1 overflow-x-auto ${scrolls ? "motion-safe:overflow-hidden" : ""}`}>
        <div
          className={`flex w-max ${scrolls ? "motion-safe:animate-ticker motion-safe:group-focus-within:[animation-play-state:paused] motion-safe:group-hover:[animation-play-state:paused]" : ""}`}
        >
          {row(false)}
          {/* Second copy makes the loop seamless; hidden where there is no animation. */}
          {scrolls && <div className="hidden motion-safe:flex">{row(true)}</div>}
        </div>
      </div>
    </section>
  );
}

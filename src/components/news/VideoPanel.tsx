import Link from "next/link";
import type { VideoCard } from "@/server/services/content";
import { formatDuration } from "@/lib/content/youtube";
import { VideoThumb } from "@/components/videos/VideoCards";

/** One lead video on desktop; a swipeable row on phones. */
export function VideoPanel({ videos, title, allHref, allLabel }: { videos: VideoCard[]; title: string; allHref?: string; allLabel?: string }) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-white">
      <h2 className="flex items-center justify-between gap-2 bg-navy px-4 py-2.5 text-[17px] font-bold text-white">
        {title}
        {allHref && (
          <Link href={allHref} className="text-sm font-semibold text-navy-soft hover:text-white hover:underline">
            {allLabel} ›
          </Link>
        )}
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto p-4 lg:flex-col lg:overflow-visible">
        {videos.map((v, i) => {
          const lead = i === 0;
          const body = (
            <>
              {/* Phones show every thumbnail; desktop shows it for the lead video only. */}
              <span className={lead ? "block" : "block lg:hidden"}>
                <VideoThumb video={v} sizes="(min-width: 1024px) 400px, 240px" />
              </span>
              <span className={`mt-2 block font-semibold leading-snug ${lead ? "lg:text-[17px]" : "lg:mt-0"}`}>{v.title}</span>
              {!lead && <span className="hidden font-latin text-[12.5px] text-muted lg:block">{formatDuration(v.durationSeconds)}</span>}
            </>
          );
          return (
            <li key={v.id} className={`w-60 shrink-0 snap-start lg:w-auto ${lead ? "" : "lg:border-t lg:border-line lg:pt-3"}`}>
              {v.href ? (
                <Link href={v.href} className="block hover:text-brand-dark">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import Link from "next/link";
import type { VideoCard } from "@/server/services/content";

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function VideoThumb({ seconds }: { seconds: number }) {
  return (
    <span className="relative flex aspect-video items-center justify-center rounded-md bg-placeholder">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="absolute bottom-2 right-2 rounded-sm bg-brand px-1.5 py-0.5 font-latin text-[12.5px] font-bold text-white">
        {duration(seconds)}
      </span>
    </span>
  );
}

/** One lead video on desktop; a swipeable row on phones. */
export function VideoPanel({ videos, title }: { videos: VideoCard[]; title: string }) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-white">
      <h2 className="bg-navy px-4 py-2.5 text-[17px] font-bold text-white">{title}</h2>
      <ul className="flex snap-x gap-3 overflow-x-auto p-4 lg:flex-col lg:overflow-visible">
        {videos.map((v, i) => {
          const lead = i === 0;
          const body = (
            <>
              {/* Phones show every thumbnail; desktop shows it for the lead video only. */}
              <span className={lead ? "block" : "block lg:hidden"}>
                <VideoThumb seconds={v.durationSeconds} />
              </span>
              <span className={`mt-2 block font-semibold leading-snug ${lead ? "lg:text-[17px]" : "lg:mt-0"}`}>{v.title}</span>
              {!lead && <span className="hidden font-latin text-[12.5px] text-muted lg:block">{duration(v.durationSeconds)}</span>}
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

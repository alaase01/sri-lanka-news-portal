import Link from "next/link";
import type { VideoCard } from "@/server/services/content";
import { formatDuration } from "@/lib/content/youtube";
import { Thumb } from "@/components/news/Thumb";

/** A video thumbnail with the play mark and length, our own image only (no YouTube request). */
export function VideoThumb({ video, sizes, className = "" }: { video: Pick<VideoCard, "image" | "durationSeconds">; sizes?: string; className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-md ${className}`}>
      <Thumb image={video.image} className="aspect-video w-full" sizes={sizes} />
      <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-navy/90 text-white">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
      {video.durationSeconds > 0 && (
        <span className="absolute bottom-2 right-2 rounded-sm bg-brand px-1.5 py-0.5 font-latin text-[12.5px] font-bold text-white">{formatDuration(video.durationSeconds)}</span>
      )}
    </span>
  );
}

export function VideoGrid({ videos }: { videos: VideoCard[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {videos.map((v) => (
        <li key={v.id} className="overflow-hidden rounded-md bg-white">
          {v.href ? (
            <Link href={v.href} className="group block">
              <VideoThumb video={v} />
              <span className="block px-3.5 py-3 font-semibold leading-snug group-hover:text-brand-dark">{v.title}</span>
            </Link>
          ) : (
            <>
              <VideoThumb video={v} />
              <span className="block px-3.5 py-3 font-semibold leading-snug">{v.title}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

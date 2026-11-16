"use client";

import { useState } from "react";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";
import { formatDuration, YOUTUBE_ID, youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/content/youtube";
import type { CardImage } from "@/server/services/content";

/**
 * Click-to-play YouTube player. Until the reader presses play, the page shows
 * our own copy of the thumbnail and makes no request to YouTube or Google.
 * After that the video is embedded from youtube-nocookie.com.
 */
export function YouTubePlayer({
  youtubeId,
  title,
  image,
  durationSeconds,
  labels,
}: {
  youtubeId: string;
  title: string;
  image: CardImage | null;
  durationSeconds: number;
  labels: { play: string; privacy: string; watchOnYouTube: string; unavailable: string };
}) {
  const [playing, setPlaying] = useState(false);
  const valid = YOUTUBE_ID.test(youtubeId);

  if (playing && valid) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          src={youtubeEmbedUrl(youtubeId)}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setPlaying(true)}
        disabled={!valid}
        className="group relative block aspect-video w-full overflow-hidden rounded-md bg-navy text-white disabled:cursor-not-allowed"
        aria-label={valid ? `${labels.play}: ${title}` : labels.unavailable}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP with srcset
          <img
            src={mediaUrl(image.storageKey, 960)}
            srcSet={mediaSrcSet(image.storageKey, image.width)}
            sizes="(min-width: 1024px) 760px, 100vw"
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-[#0b1f3a55] transition group-hover:bg-[#0b1f3a33]" />
        {valid ? (
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand shadow-lg transition group-hover:scale-105">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        ) : (
          <span className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center font-semibold">{labels.unavailable}</span>
        )}
        {durationSeconds > 0 && (
          <span className="absolute bottom-3 right-3 rounded-sm bg-brand px-1.5 py-0.5 font-latin text-[13px] font-bold">{formatDuration(durationSeconds)}</span>
        )}
      </button>
      <p className="mt-2 flex flex-wrap justify-between gap-2 text-[13px] text-muted">
        <span>{labels.privacy}</span>
        {valid && (
          <a href={youtubeWatchUrl(youtubeId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy hover:underline">
            {labels.watchOnYouTube} ↗
          </a>
        )}
      </p>
    </div>
  );
}

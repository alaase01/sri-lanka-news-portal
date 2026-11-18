"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HeroSlide } from "@/server/services/content";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";

type Labels = { featured: string; readMore: string; previous: string; next: string; pause: string; play: string };

/** Seconds each featured story stays on screen. */
export const HERO_ROTATE_SECONDS = 5;

/**
 * Featured stories, one at a time. Every few seconds the next story slides in
 * from the left, always in the same direction; after the last one the first
 * comes round again.
 *
 * Accessibility: rotation pauses while the pointer is over the carousel or
 * keyboard focus is inside it, and the reader can stop it with the pause
 * button. Readers who ask for reduced motion get no sliding animation.
 * Only the visible slide can be focused or read by screen readers.
 */
export function HeroCarousel({ slides, labels }: { slides: HeroSlide[]; labels: Labels }) {
  const [index, setIndex] = useState(0);
  // The story that is sliding out; null before the first change.
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const count = slides.length;
  const rotating = count > 1 && !paused && !hovered && !focused;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => {
      setLeaving(index);
      setIndex((index + 1) % count);
    }, HERO_ROTATE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [rotating, index, count]);

  if (count === 0) return null;
  // Every change moves the same way, left to right; after the last story comes the first.
  const show = (next: number) => {
    if (next === index) return;
    setLeaving(index);
    setIndex(next);
  };
  const go = (step: number) => show((index + step + count) % count);

  const arrow =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded bg-navy text-white hover:bg-navy-deep sm:flex";

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label={labels.featured}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className="on-dark relative overflow-hidden rounded-lg bg-[#1f3350] text-white"
    >
      {/* All slides share one grid cell, so the carousel is as tall as the tallest story and nothing jumps.
          Only the current story and the one sliding out are visible. */}
      <div aria-live={rotating ? "off" : "polite"} className="grid">
        {slides.map((slide, i) => {
          const current = i === index;
          const motion =
            leaving === null ? "" : current ? "motion-safe:animate-hero-in z-[1]" : i === leaving ? "motion-safe:animate-hero-out motion-reduce:invisible" : "invisible";
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={!current}
              inert={!current}
              className={`relative col-start-1 row-start-1 flex min-h-[320px] w-full flex-col justify-end p-5 pb-16 sm:min-h-[400px] sm:px-[72px] sm:pb-16 sm:pt-8 ${
                leaving === null && !current ? "invisible" : ""
              } ${motion}`}
            >
              {slide.image && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP with srcset */}
                  <img
                    src={mediaUrl(slide.image.storageKey, 960)}
                    srcSet={mediaSrcSet(slide.image.storageKey, slide.image.width)}
                    sizes="(min-width: 1280px) 860px, 100vw"
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {/* Darkens the lower part so white text stays readable on any photo. */}
                  <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0b1f3a] via-[#0b1f3acc] to-[#0b1f3a33]" />
                </>
              )}
              <div className="relative flex flex-col items-start">
                {slide.categoryName && <span className="rounded-sm bg-brand px-2.5 py-0.5 text-[13px] font-semibold">{slide.categoryName}</span>}
                {/* One h1 for the page: the first story's headline. */}
                {(() => {
                  const Heading = i === 0 ? "h1" : "h2";
                  return (
                    <Heading className="mt-3 max-w-2xl text-[26px] font-bold leading-[1.45] sm:text-4xl sm:leading-[1.4]">
                      <Link href={slide.href} className="hover:underline">
                        {slide.headline}
                      </Link>
                    </Heading>
                  );
                })()}
                <p className="mt-2 line-clamp-3 max-w-xl text-[15px] text-[#e3e9f2] sm:text-base">{slide.summary}</p>
                <Link href={slide.href} className="mt-5 rounded bg-brand px-4 py-2.5 font-semibold hover:bg-brand-dark">
                  {labels.readMore}
                  <span className="sr-only">: {slide.headline}</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label={labels.previous} className={`${arrow} left-3`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" onClick={() => go(1)} aria-label={labels.next} className={`${arrow} right-3`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? labels.play : labels.pause}
              className="flex h-11 w-11 items-center justify-center"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1f3acc]">
                {paused ? (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>
                ) : (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                )}
              </span>
            </button>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => show(i)}
                aria-label={`${i + 1} / ${count}`}
                aria-current={i === index ? "true" : undefined}
                className="flex h-11 w-8 items-center justify-center"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${i === index ? "bg-brand-light" : "bg-white"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

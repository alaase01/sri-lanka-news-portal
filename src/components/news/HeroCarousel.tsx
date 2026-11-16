"use client";

import { useState } from "react";
import Link from "next/link";
import type { HeroSlide } from "@/server/services/content";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";

type Labels = { featured: string; readMore: string; previous: string; next: string };

/** Featured stories. Manual controls only: nothing moves unless the reader asks. */
export function HeroCarousel({ slides, labels }: { slides: HeroSlide[]; labels: Labels }) {
  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;
  const slide = slides[index];
  const go = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length);

  const arrow =
    "absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded bg-navy text-white hover:bg-navy-deep sm:flex";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.featured}
      className="on-dark relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-lg bg-[#1f3350] p-5 text-white sm:min-h-[400px] sm:px-[72px] sm:py-8"
    >
      {slide.image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-resized WebP with srcset */}
          <img
            key={slide.id}
            src={mediaUrl(slide.image.storageKey, 960)}
            srcSet={mediaSrcSet(slide.image.storageKey, slide.image.width)}
            sizes="(min-width: 1280px) 860px, 100vw"
            alt=""
            fetchPriority={index === 0 ? "high" : "auto"}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Darkens the lower part so white text stays readable on any photo. */}
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0b1f3a] via-[#0b1f3acc] to-[#0b1f3a33]" />
        </>
      )}
      <div aria-live="polite" className="relative flex flex-col items-start">
        {slide.categoryName && (
          <span className="rounded-sm bg-brand px-2.5 py-0.5 text-[13px] font-semibold">{slide.categoryName}</span>
        )}
        <h1 className="mt-3 max-w-2xl text-[26px] font-bold leading-[1.45] sm:text-4xl sm:leading-[1.4]">
          <Link href={slide.href} className="hover:underline">
            {slide.headline}
          </Link>
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-[#e3e9f2] sm:text-base">{slide.summary}</p>
        <Link href={slide.href} className="mt-5 rounded bg-brand px-4 py-2.5 font-semibold hover:bg-brand-dark">
          {labels.readMore}
          <span className="sr-only">: {slide.headline}</span>
        </Link>
      </div>

      {slides.length > 1 && (
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
          <div className="mt-5 flex gap-1 self-center">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1} / ${slides.length}`}
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

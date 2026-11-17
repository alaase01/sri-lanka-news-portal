"use client";

import { useEffect, useRef, useState } from "react";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";
import { AD_ROTATE_SECONDS, type AdView } from "@/lib/content/ads";

/**
 * Shows the banners booked for one position, one at a time.
 *
 * - Starts at a random banner, so the first in the list gets no extra exposure.
 * - Changes every 10 seconds (AD_ROTATE_SECONDS) with a cross-fade; pauses while hovered or
 *   focused, while the reader has paused it, while it is off screen, and while
 *   the tab is in the background. Readers who ask for reduced motion get one
 *   banner and no rotation.
 * - A view is counted once per banner per page, after it has been at least half
 *   visible for one second.
 */
export function AdRotator({
  ads,
  box,
  desktopFrom,
  labels,
}: {
  ads: AdView[];
  box: string;
  desktopFrom: string;
  labels: { pause: string; play: string };
}) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const counted = useRef(new Set<string>());
  const many = ads.length > 1;

  // Random starting banner and the reader's motion preference (browser only).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the browser after hydration */
    setReducedMotion(reduce.matches);
    if (many) setIndex(Math.floor(Math.random() * ads.length));
    setStarted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [many, ads.length]);

  // On screen at least half?
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Count a view after one second of being visible, once per banner per page.
  const current = ads[index];
  useEffect(() => {
    if (!started || !visible || !current || counted.current.has(current.id) || document.hidden) return;
    const timer = window.setTimeout(() => {
      counted.current.add(current.id);
      const body = JSON.stringify([current.id]);
      if (!navigator.sendBeacon?.("/api/ads/view", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/ads/view", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [started, visible, current]);

  // Rotate.
  useEffect(() => {
    if (!many || !started || paused || hovered || !visible || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % ads.length);
    }, AD_ROTATE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [many, started, paused, hovered, visible, reducedMotion, ads.length]);

  return (
    <div
      ref={root}
      className={`relative max-w-full overflow-hidden rounded bg-soft ${box}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {ads.map((ad, i) => {
        const active = i === index;
        const fallback = ad.mobile ?? ad.desktop!;
        return (
          <a
            key={ad.id}
            href={`/go/ad/${ad.id}`}
            target="_blank"
            rel="sponsored noopener"
            aria-hidden={!active}
            tabIndex={active ? 0 : -1}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <picture>
              {ad.desktop && ad.mobile && <source media={desktopFrom} srcSet={mediaSrcSet(ad.desktop.storageKey, ad.desktop.width)} />}
              { }
              <img
                src={mediaUrl(fallback.storageKey, 960)}
                srcSet={mediaSrcSet(fallback.storageKey, fallback.width)}
                alt={ad.advertiser}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-contain"
              />
            </picture>
          </a>
        );
      })}
      {many && !reducedMotion && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? labels.play : labels.pause}
          title={paused ? labels.play : labels.pause}
          className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-navy/70 text-white hover:bg-navy"
        >
          {paused ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          )}
        </button>
      )}
    </div>
  );
}

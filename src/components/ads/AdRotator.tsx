"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaSrcSet, mediaUrl } from "@/lib/content/media";
import { AD_ROTATE_SECONDS, type AdView } from "@/lib/content/ads";

/**
 * Shows the banners booked for one position, one at a time.
 *
 * - On wide screens (`desktopFrom`) only banners with a desktop image take part,
 *   on narrow screens only those with a mobile image, so a phone-sized banner is
 *   never stretched across the desktop slot. If none fit, all are used.
 * - Starts at a random banner, so the first in the list gets no extra exposure.
 * - Changes every AD_ROTATE_SECONDS with a cross-fade. Pauses while the reader
 *   has paused it, while the mouse is over it, while a banner has keyboard focus,
 *   while it is off screen and while the tab is in the background. A click does
 *   not keep it paused once the mouse moves away.
 *   Readers who ask for reduced motion get one banner and no rotation.
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
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  /** null until the browser has said how wide the screen is. */
  const [wide, setWide] = useState<boolean | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const counted = useRef(new Set<string>());

  const shown = useMemo(() => {
    if (wide === null) return ads;
    const fitting = ads.filter((a) => (wide ? a.desktop : a.mobile));
    return fitting.length > 0 ? fitting : ads;
  }, [ads, wide]);
  const many = shown.length > 1;

  // The reader's motion preference and screen width (browser only).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia(desktopFrom);
    /* eslint-disable react-hooks/set-state-in-effect -- read from the browser after hydration */
    setReducedMotion(reduce.matches);
    setWide(desktop.matches);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onChange = () => setWide(desktop.matches);
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [desktopFrom]);

  // Random starting banner, chosen again whenever the set of banners changes.
  useEffect(() => {
    if (wide === null) return;
    /* eslint-disable react-hooks/set-state-in-effect -- needs the browser's screen width */
    setIndex(shown.length > 1 ? Math.floor(Math.random() * shown.length) : 0);
    setStarted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [wide, shown.length]);

  // On screen at least half?
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Count a view after one second of being visible, once per banner per page.
  const current = shown[index] ?? shown[0];
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
    if (!many || !started || paused || hovered || keyboardFocus || !visible || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % shown.length);
    }, AD_ROTATE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [many, started, paused, hovered, keyboardFocus, visible, reducedMotion, shown.length]);

  return (
    <div
      ref={root}
      className={`relative max-w-full overflow-hidden rounded bg-soft ${box}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Only keyboard focus pauses; a mouse click leaves focus on the link and must not stop the rotation.
      onFocus={(e) => setKeyboardFocus(e.target.matches(":focus-visible"))}
      onBlur={() => setKeyboardFocus(false)}
    >
      {shown.map((ad, i) => {
        const active = ad.id === current?.id;
        const fallback = ad.mobile ?? ad.desktop!;
        const chosen = wide === null ? null : wide ? (ad.desktop ?? ad.mobile!) : (ad.mobile ?? ad.desktop!);
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
            {chosen ? (
              // Once the screen width is known, the right image is chosen here rather than left to <picture>.
              // eslint-disable-next-line @next/next/no-img-element -- images are already resized and served from /media
              <img
                key={chosen.storageKey}
                src={mediaUrl(chosen.storageKey, 960)}
                srcSet={mediaSrcSet(chosen.storageKey, chosen.width)}
                alt={ad.advertiser}
                loading={active ? "eager" : "lazy"}
                className="h-full w-full object-contain"
              />
            ) : (
              <picture>
                {ad.desktop && ad.mobile && <source media={desktopFrom} srcSet={mediaSrcSet(ad.desktop.storageKey, ad.desktop.width)} />}
                <img
                  src={mediaUrl(fallback.storageKey, 960)}
                  srcSet={mediaSrcSet(fallback.storageKey, fallback.width)}
                  alt={ad.advertiser}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-contain"
                />
              </picture>
            )}
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

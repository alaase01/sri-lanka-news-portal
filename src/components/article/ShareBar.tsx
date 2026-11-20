"use client";

import { useState, useSyncExternalStore, type MouseEvent } from "react";
import { buildShareLinks, type ShareTarget } from "@/lib/share";

type Labels = { share: string; copyLink: string; linkCopied: string; copyFailed: string; shareMore: string; shareOn: string };

const PLATFORMS: { id: ShareTarget; name: string }[] = [
  { id: "whatsapp", name: "WhatsApp" },
  { id: "facebook", name: "Facebook" },
  { id: "x", name: "X" },
  { id: "telegram", name: "Telegram" },
];

const subscribe = () => () => {};

/**
 * Share controls for an article. `url` is the absolute canonical address of this
 * language version; it is only ever rendered on a published article's page.
 * On devices with a native share sheet, a button for it is added.
 */
export function ShareBar({ url, title, summary, labels }: { url: string; title: string; summary: string; labels: Labels }) {
  const links = buildShareLinks(url, title);
  const canNativeShare = useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 3000);
  };

  // On computers, open Facebook, X and Telegram in a small window (as their share dialogs expect).
  // On phones, and if a popup blocker stops it, the link opens normally.
  const openPopup = (e: MouseEvent<HTMLAnchorElement>, id: ShareTarget) => {
    if (id === "whatsapp" || e.ctrlKey || e.metaKey || e.shiftKey || window.matchMedia("(max-width: 767px)").matches) return;
    const w = 600;
    const h = 560;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const win = window.open(links[id], `share-${id}`, `popup,width=${w},height=${h},left=${left},top=${top}`);
    if (win) {
      e.preventDefault();
      try {
        win.opener = null;
      } catch {
        // Already cut off from this page (Cross-Origin-Opener-Policy); nothing to do.
      }
    }
  };

  const nativeShare = () => {
    // Rejection means the visitor closed the share sheet; nothing to report.
    navigator.share({ title, text: summary, url }).catch(() => undefined);
  };

  const button =
    "flex min-h-11 items-center rounded border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-muted hover:text-brand-dark";

  return (
    <section aria-label={labels.share} className="flex flex-wrap items-center gap-2">
      <h2 className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" />
        </svg>
        {labels.share}
      </h2>
      <ul className="flex flex-wrap gap-2 font-latin">
        {PLATFORMS.map((p) => (
          <li key={p.id}>
            <a
              href={links[p.id]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openPopup(e, p.id)}
              aria-label={labels.shareOn.replace("{name}", p.name)}
              className={button}
            >
              {p.name}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" onClick={copy} className={button}>
        {labels.copyLink}
      </button>
      {canNativeShare && (
        <button type="button" onClick={nativeShare} className={button}>
          {labels.shareMore}
        </button>
      )}
      <span role="status" aria-live="polite" className="text-sm font-semibold text-brand-dark">
        {copyState === "copied" ? labels.linkCopied : copyState === "failed" ? labels.copyFailed : ""}
      </span>
    </section>
  );
}

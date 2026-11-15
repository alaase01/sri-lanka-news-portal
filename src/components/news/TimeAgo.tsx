"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatRelative } from "@/lib/utils/dates";

/** Re-render subscribers once a minute. */
function subscribeToMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

/**
 * Renders the absolute time on the server (so cached HTML never goes stale),
 * then shows a relative time in the browser.
 */
export function TimeAgo({ iso, locale, className }: { iso: string; locale: Locale; className?: string }) {
  const absolute = formatDateTime(iso, locale);
  const label = useSyncExternalStore(
    subscribeToMinute,
    () => formatRelative(iso, locale, Date.now()),
    () => absolute,
  );
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {label}
    </time>
  );
}

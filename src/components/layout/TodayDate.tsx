"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/config";
import { formatToday } from "@/lib/utils/dates";

const subscribe = () => () => {};

/** Today's date in Sri Lanka time. Filled in by the browser so cached pages never show a stale date. */
export function TodayDate({ locale }: { locale: Locale }) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatToday(Date.now(), locale),
    () => "",
  );
  return <span className="inline-block min-w-44">{label}</span>;
}

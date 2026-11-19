"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the page data every few seconds while something is running on the server. */
export function AutoRefresh({ active, seconds = 15 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(t);
  }, [active, seconds, router]);
  return null;
}

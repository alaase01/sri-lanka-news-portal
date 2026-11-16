import type { Locale } from "@/lib/i18n/config";

/**
 * Date formatting for both editions.
 *
 * Written by hand rather than with Intl: Sinhala locale data is missing or
 * inconsistent in some browsers and Node builds (traditional month names,
 * English fallbacks), and the server and browser must produce the same text.
 * Sri Lanka uses UTC+05:30 all year, so the offset is fixed.
 */

const COLOMBO_OFFSET_MS = 5.5 * 3_600_000;

const MONTHS: Record<Locale, string[]> = {
  si: ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

const WEEKDAYS: Record<Locale, string[]> = {
  si: ["ඉරිදා", "සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function colomboParts(time: number) {
  const d = new Date(time + COLOMBO_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: String(d.getUTCHours()).padStart(2, "0"),
    minutes: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

function formatDay(time: number, locale: Locale): string {
  const p = colomboParts(time);
  const month = MONTHS[locale][p.month];
  return locale === "si" ? `${p.year} ${month} ${p.day}` : `${p.day} ${month} ${p.year}`;
}

/** Absolute date and time in Sri Lanka time, e.g. "2026 නොවැම්බර් 15, 21:18". */
export function formatDateTime(iso: string, locale: Locale): string {
  const time = new Date(iso).getTime();
  const p = colomboParts(time);
  return `${formatDay(time, locale)}, ${p.hours}:${p.minutes}`;
}

/** Today's date with the weekday, e.g. "2026 නොවැම්බර් 15, ඉරිදා". */
export function formatToday(now: number, locale: Locale): string {
  const weekday = WEEKDAYS[locale][colomboParts(now).weekday];
  return locale === "si" ? `${formatDay(now, locale)}, ${weekday}` : `${weekday}, ${formatDay(now, locale)}`;
}

/** Relative time ("මිනිත්තු 12කට පෙර"). Depends on the current time, so only call it in the browser. */
export function formatRelative(iso: string, locale: Locale, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return locale === "si" ? "මේ දැන්" : "Just now";

  const unit = (n: number, si: string, en: string) =>
    locale === "si" ? `${si} ${n}කට පෙර` : `${n} ${en}${n === 1 ? "" : "s"} ago`;

  if (minutes < 60) return unit(minutes, "මිනිත්තු", "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "පැය", "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return unit(days, "දින", "day");
  return formatDateTime(iso, locale);
}

/** "YYYY-MM-DDTHH:mm" in Sri Lanka time, for <input type="datetime-local">. */
export function toColomboInput(date: Date): string {
  return new Date(date.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 16);
}

/** Parses a datetime-local value as Sri Lanka time. Returns null for anything malformed. */
export function fromColomboInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

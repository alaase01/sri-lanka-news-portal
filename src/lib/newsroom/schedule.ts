/**
 * Newsroom schedule: four runs a day at 00:00, 06:00, 12:00 and 18:00 Sri Lanka
 * time (UTC+05:30, no daylight saving). All times are stored in UTC; these
 * helpers only decide which window a moment belongs to. Safe for client use.
 */

const OFFSET_MS = (5 * 60 + 30) * 60_000;
const SLOT_MS = 6 * 60 * 60_000;
/** A scheduled run may start within this long after its slot time (covers restarts and retries). */
export const SLOT_WINDOW_MS = 3 * 60 * 60_000;

export type Slot = { key: string; start: Date };

/** The schedule slot containing `now`: its start time and a unique key such as "2026-11-19T06:00+05:30". */
export function slotFor(now: Date): Slot {
  const local = now.getTime() + OFFSET_MS;
  const startLocal = Math.floor(local / SLOT_MS) * SLOT_MS;
  const d = new Date(startLocal);
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00+05:30`;
  return { key, start: new Date(startLocal - OFFSET_MS) };
}

/** The next slot after `now`. */
export function nextSlot(now: Date): Slot {
  const current = slotFor(now);
  return slotFor(new Date(current.start.getTime() + SLOT_MS));
}

/** Whether a scheduled run for the slot may still start at `now`. */
export function inWindow(slot: Slot, now: Date): boolean {
  const t = now.getTime() - slot.start.getTime();
  return t >= 0 && t < SLOT_WINDOW_MS;
}

/** Wait before retrying a failed scheduled run: 10, then 20 minutes. */
export function retryDelayMs(attempt: number): number {
  return 10 * 60_000 * 2 ** Math.max(0, attempt - 1);
}
export const MAX_ATTEMPTS = 3;

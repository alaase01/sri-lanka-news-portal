import "server-only";
import { db } from "@/server/db/client";
import { estimateCostUsd } from "./pricing";

/**
 * Monthly AI budget for the whole site (Editorial Assistant and the automated
 * newsroom), counted in the Sri Lanka calendar month from the estimated cost of
 * every logged request. Before an expensive call its worst-case cost is
 * reserved; the reservation is released when the real cost has been logged.
 *
 * The limit lives in SiteSettings and can only be changed by an admin through
 * the Settings page; nothing in the AI code can raise it.
 */

const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Start of the current Sri Lanka calendar month, as a UTC instant. */
export function monthStart(now: Date): Date {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - COLOMBO_OFFSET_MS);
}

/** "2026-11", the Sri Lanka calendar month. */
export function monthKey(now: Date): string {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Worst-case reservations of calls in progress (one server process). */
const reservations = new Map<string, number>();
let nextId = 0;

export type BudgetStatus = { limit: number; spent: number; reserved: number; remaining: number; percent: number };

export async function budgetStatus(now: Date): Promise<BudgetStatus> {
  const [settings, sum] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: 1 }, select: { aiMonthlyBudgetUsd: true } }),
    db.aiUsageLog.aggregate({ where: { createdAt: { gte: monthStart(now) } }, _sum: { estimatedCostUsd: true } }),
  ]);
  const limit = settings ? Number(settings.aiMonthlyBudgetUsd) : 20;
  const spent = Number(sum._sum.estimatedCostUsd ?? 0);
  const reserved = [...reservations.values()].reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, limit - spent - reserved);
  return { limit, spent, reserved, remaining, percent: limit > 0 ? ((spent + reserved) / limit) * 100 : 100 };
}

/**
 * Worst-case cost of one call: the whole input estimate plus every output token
 * allowed, plus every search allowed. Unknown models are refused (no guessing).
 */
export function worstCaseCost(model: string, inputTokens: number, maxOutputTokens: number, maxSearches = 0): number | null {
  return estimateCostUsd(model, inputTokens, maxOutputTokens, maxSearches);
}

/** Reserves `amount` if it fits in the remaining budget. Returns a release function, or null when it does not fit. */
export async function reserve(amount: number, now: Date): Promise<(() => void) | null> {
  const s = await budgetStatus(now);
  if (amount > s.remaining) return null;
  const id = `r${nextId++}`;
  reservations.set(id, amount);
  return () => reservations.delete(id);
}

/** For tests. */
export function clearReservations() {
  reservations.clear();
}

/** Creates the 75%, 90% and 100% notices once per month. */
export async function noteBudgetLevel(now: Date): Promise<void> {
  const s = await budgetStatus(now);
  const pct = s.limit > 0 ? (s.spent / s.limit) * 100 : 100;
  const month = monthKey(now);
  const levels: [number, string, string][] = [
    [100, "error", `The monthly AI budget of USD ${s.limit.toFixed(2)} is used up (${month}). New AI work is stopped until next month or until an admin raises the limit in Settings.`],
    [90, "warning", `90% of the monthly AI budget is used (USD ${s.spent.toFixed(2)} of ${s.limit.toFixed(2)}).`],
    [75, "warning", `75% of the monthly AI budget is used (USD ${s.spent.toFixed(2)} of ${s.limit.toFixed(2)}).`],
  ];
  for (const [level, tone, message] of levels) {
    if (pct >= level) {
      await db.newsroomNotice.upsert({ where: { key: `budget-${level}-${month}` }, create: { key: `budget-${level}-${month}`, level: tone, message }, update: {} });
    }
  }
}

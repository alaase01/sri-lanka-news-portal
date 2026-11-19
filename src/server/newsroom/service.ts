import "server-only";
import { db } from "@/server/db/client";
import { inWindow, MAX_ATTEMPTS, nextSlot, retryDelayMs, slotFor } from "@/lib/newsroom/schedule";
import { budgetStatus } from "@/server/ai/budget";
import { NEWSROOM_LIMITS } from "./config";
import { createDraftPair, runPipeline, worldCategoryId, type PipelineDeps, type Written } from "./pipeline";

/**
 * Newsroom runs: the schedule tick, manual runs, the lock against overlapping
 * runs, and the data and controls of the admin dashboard. Callers of the admin
 * functions must have checked the session.
 */

async function settings() {
  return db.newsroomSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

/** Takes the run lock if it is free (or has lapsed). Atomic: only one caller can win. */
async function takeLock(runId: string, now: Date): Promise<boolean> {
  await settings();
  const r = await db.newsroomSettings.updateMany({
    where: { id: 1, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockRunId: runId, lockedUntil: new Date(now.getTime() + NEWSROOM_LIMITS.lockMinutes * 60_000) },
  });
  return r.count === 1;
}

async function releaseLock(runId: string) {
  await db.newsroomSettings.updateMany({ where: { id: 1, lockRunId: runId }, data: { lockRunId: null, lockedUntil: null } });
}

async function notice(level: "info" | "warning" | "error", message: string, key?: string) {
  if (key) await db.newsroomNotice.upsert({ where: { key }, create: { key, level, message }, update: {} });
  else await db.newsroomNotice.create({ data: { level, message } });
}

/** Marks runs left RUNNING by a crash or restart as failed. */
async function failStaleRuns(now: Date) {
  const cutoff = new Date(now.getTime() - NEWSROOM_LIMITS.lockMinutes * 60_000);
  await db.newsroomRun.updateMany({ where: { status: "RUNNING", startedAt: { lt: cutoff } }, data: { status: "FAILED", finishedAt: now, message: "Interrupted (the server stopped or restarted during the run)." } });
}

/** Runs the pipeline for a run that holds the lock, then records the outcome and notices. */
export async function executeRun(runId: string, deps: PipelineDeps = {}): Promise<void> {
  const now = () => deps.now?.() ?? new Date();
  try {
    const s = await settings();
    const outcome = await runPipeline(runId, Math.min(s.maxStoriesPerRun, NEWSROOM_LIMITS.maxStoriesCeiling), deps);
    const cost = await db.aiUsageLog.aggregate({ where: { newsroomRunId: runId }, _sum: { estimatedCostUsd: true } });
    const run = await db.newsroomRun.update({
      where: { id: runId },
      data: { status: outcome.status, message: outcome.message, finishedAt: now(), costUsd: cost._sum.estimatedCostUsd ?? 0 },
    });
    if (outcome.status === "FAILED") {
      await notice("error", `Newsroom run failed: ${outcome.message ?? "unknown error"}`);
    } else if (run.drafted > 0) {
      await notice("info", `Newsroom run finished: ${run.drafted} new bilingual draft${run.drafted === 1 ? "" : "s"} in World, ready for review.${run.held ? ` ${run.held} held for review.` : ""}`);
    } else {
      await notice(run.held ? "warning" : "info", run.held ? `Newsroom run finished: ${run.held} stor${run.held === 1 ? "y" : "ies"} held for review, no new drafts.` : "Newsroom run finished: no suitable new stories were found, so nothing was created.");
    }
    if (outcome.message?.startsWith("Stopped: the monthly AI budget")) await notice("error", outcome.message);
    if (run.failed > 0) await notice("warning", `${run.failed} stor${run.failed === 1 ? "y" : "ies"} failed during drafting; nothing was created for them.`);
  } catch {
    await db.newsroomRun.update({ where: { id: runId }, data: { status: "FAILED", finishedAt: now(), message: "Unexpected error during the run." } }).catch(() => undefined);
    await notice("error", "Newsroom run failed with an unexpected error. Details are in the server log.");
  } finally {
    await releaseLock(runId);
  }
}

export type TickResult = { action: "disabled" | "busy" | "nothing" | "started" | "retrying" | "outside-window"; runId?: string };

/**
 * Called by the server timer every few minutes. Starts the run for the current
 * schedule slot once (the slot key is unique), retries a failed one with
 * increasing delays, and never overlaps runs.
 */
export async function tick(now: Date): Promise<TickResult> {
  await failStaleRuns(now);
  const s = await settings();
  if (!s.enabled) return { action: "disabled" };
  const slot = slotFor(now);
  if (!inWindow(slot, now)) return { action: "outside-window" };

  const existing = await db.newsroomRun.findUnique({ where: { slotKey: slot.key } });
  if (existing) {
    const retryAt = (existing.finishedAt?.getTime() ?? 0) + retryDelayMs(existing.attempt);
    if (existing.status !== "FAILED" || existing.attempt >= MAX_ATTEMPTS || retryAt > now.getTime()) return { action: "nothing" };
    if (!(await takeLock(existing.id, now))) return { action: "busy" };
    await db.newsroomRun.update({ where: { id: existing.id }, data: { status: "RUNNING", attempt: { increment: 1 }, startedAt: now, finishedAt: null, message: null } });
    return { action: "retrying", runId: existing.id };
  }

  const budget = await budgetStatus(now);
  let run;
  try {
    run = await db.newsroomRun.create({ data: { slotKey: slot.key, trigger: "schedule", startedAt: now } });
  } catch {
    return { action: "nothing" }; // another tick created it at the same moment
  }
  if (budget.remaining < 0.05) {
    await db.newsroomRun.update({ where: { id: run.id }, data: { status: "SKIPPED", finishedAt: now, message: "Skipped: the monthly AI budget is used up." } });
    await notice("error", "A scheduled newsroom run was skipped because the monthly AI budget is used up.", `budget-skip-${slot.key}`);
    return { action: "nothing" };
  }
  if (!(await takeLock(run.id, now))) {
    await db.newsroomRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: now, message: "Another run was still in progress; will retry." } });
    return { action: "busy" };
  }
  return { action: "started", runId: run.id };
}

/** Manual "Run now" (also the manual test run). Works while scheduling is off. */
export async function startManualRun(adminId: string, now: Date): Promise<{ ok: true; runId: string } | { ok: false; message: string }> {
  await failStaleRuns(now);
  if (!(await worldCategoryId())) return { ok: false, message: 'The World category (English slug "world") was not found.' };
  const budget = await budgetStatus(now);
  if (budget.remaining < 0.05) return { ok: false, message: "The monthly AI budget is used up. Raise it in Settings or wait for next month." };
  const run = await db.newsroomRun.create({ data: { slotKey: `manual-${now.getTime()}-${adminId.slice(-6)}`, trigger: "manual", startedAt: now, triggeredById: adminId } });
  if (!(await takeLock(run.id, now))) {
    await db.newsroomRun.delete({ where: { id: run.id } });
    return { ok: false, message: "A run is already in progress. Wait for it to finish." };
  }
  return { ok: true, runId: run.id };
}

// ───────────────────────── admin controls ─────────────────────────

export async function setEnabled(enabled: boolean, now: Date): Promise<{ ok: true } | { ok: false; message: string }> {
  if (enabled) {
    const tested = await db.newsroomRun.count({ where: { trigger: "manual", status: "SUCCEEDED" } });
    if (!tested) return { ok: false, message: "Run one manual test first (Run now) and check its drafts. Scheduling can be switched on after a successful manual run." };
  }
  await settings();
  await db.newsroomSettings.update({ where: { id: 1 }, data: { enabled } });
  await notice(enabled ? "info" : "warning", enabled ? `Scheduled runs switched on (next: ${nextSlot(now).key}).` : "Scheduled runs paused. No new runs will start until resumed.");
  return { ok: true };
}

export async function setMaxStories(n: number): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isInteger(n) || n < 1 || n > NEWSROOM_LIMITS.maxStoriesCeiling) return { ok: false, message: `Choose between 1 and ${NEWSROOM_LIMITS.maxStoriesCeiling} stories per run.` };
  await settings();
  await db.newsroomSettings.update({ where: { id: 1 }, data: { maxStoriesPerRun: n } });
  return { ok: true };
}

/** Creates the drafts for a held story after an editor has reviewed it. Still drafts only. */
export async function approveHeld(storyId: string, now: Date): Promise<{ ok: true; articleId: string } | { ok: false; message: string }> {
  const story = await db.newsroomStory.findUnique({ where: { id: storyId } });
  if (!story || story.status !== "HELD" || !story.heldContent) return { ok: false, message: "That story is not waiting for review." };
  const categoryId = await worldCategoryId();
  if (!categoryId) return { ok: false, message: 'The World category (English slug "world") was not found.' };
  const articleId = await createDraftPair(story.id, categoryId, story.heldContent as unknown as Written, now);
  await db.newsroomStory.update({ where: { id: story.id }, data: { reason: "Reviewed and saved as drafts by an editor." } });
  return { ok: true, articleId };
}

export async function discardHeld(storyId: string): Promise<{ ok: boolean }> {
  const r = await db.newsroomStory.updateMany({ where: { id: storyId, status: "HELD" }, data: { status: "DISCARDED", reason: "Discarded by an editor." } });
  return { ok: r.count === 1 };
}

export async function markNoticesRead(now: Date) {
  await db.newsroomNotice.updateMany({ where: { readAt: null }, data: { readAt: now } });
}

// ───────────────────────── dashboard data ─────────────────────────

export async function dashboard(now: Date) {
  const [s, runs, stories, held, notices, budget, completed, lastSuccess, lastAttempt, manualOk, world, records] = await Promise.all([
    settings(),
    db.newsroomRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    db.newsroomStory.findMany({
      where: { status: "DRAFTED" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { article: { select: { id: true, deletedAt: true, translations: { select: { locale: true, status: true } } } } },
    }),
    db.newsroomStory.findMany({ where: { status: "HELD" }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.newsroomNotice.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    budgetStatus(now),
    db.newsroomRun.count({ where: { status: "SUCCEEDED" } }),
    db.newsroomRun.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { startedAt: "desc" }, select: { startedAt: true, finishedAt: true } }),
    db.newsroomRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } }),
    db.newsroomRun.count({ where: { trigger: "manual", status: "SUCCEEDED" } }),
    worldCategoryId(),
    db.newsroomStory.findMany({ orderBy: { createdAt: "desc" }, take: 40, select: { id: true, topic: true, enHeadline: true, status: true, reason: true, createdAt: true } }),
  ]);
  return {
    records,
    enabled: s.enabled,
    maxStoriesPerRun: s.maxStoriesPerRun,
    running: !!(s.lockedUntil && s.lockedUntil > now),
    nextRun: s.enabled ? nextSlot(now).start : null,
    completedRuns: completed,
    lastSuccess: lastSuccess?.finishedAt ?? lastSuccess?.startedAt ?? null,
    lastAttempt,
    canEnable: manualOk > 0,
    worldFound: !!world,
    runs,
    stories,
    held,
    notices,
    unread: notices.filter((n) => !n.readAt).length,
    budget,
  };
}

export async function storyDetail(id: string) {
  return db.newsroomStory.findUnique({ where: { id }, include: { run: { select: { slotKey: true, startedAt: true } } } });
}

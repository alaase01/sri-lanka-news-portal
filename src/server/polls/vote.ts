import "server-only";
import { db } from "@/server/db/client";
import { votingConfig } from "@/config/voting";
import type { Locale } from "@/lib/i18n/config";
import { pollPhase } from "@/lib/polls/phase";
import { cleanCodeName, cleanComment, countWords, looksSuspicious } from "@/lib/polls/text";
import type { PollEventType } from "@/generated/prisma/enums";
import type { Device } from "./device";

/**
 * The voting engine. Every rule that decides whether a vote counts lives here
 * and runs on the server; nothing the browser sends is trusted beyond the
 * choice itself.
 *
 * One vote per recognised device per poll is guaranteed by the database:
 * PollVote has UNIQUE(pollId, deviceHash). The checks before the insert only
 * produce friendlier answers; the constraint is what makes duplicates
 * impossible, including under concurrent requests.
 */

export type VoteInput = {
  pollId: string;
  optionId: string;
  identity: "anonymous" | "codename";
  codeName?: string;
  comment?: string;
  locale: Locale;
  /** Hidden form field that people never fill in. */
  honeypot?: string;
  device: Device | null;
  /** True when a device cookie was sent but failed verification. */
  deviceInvalid: boolean;
  networkHash: string | null;
  now: Date;
};

export type VoteFailure =
  | "rejected"
  | "no_device"
  | "not_found"
  | "not_open"
  | "too_fast"
  | "invalid_option"
  | "invalid_code_name"
  | "invalid_comment"
  | "already_voted"
  | "rate_limited";

export type VoteResult = { ok: true; voteId: string; commentPending: boolean } | { ok: false; code: VoteFailure };

async function record(type: PollEventType, input: VoteInput, pollId: string | null) {
  // Logging must never turn a rejected vote into a server error.
  try {
    await db.pollEvent.create({
      data: { type, pollId, deviceHash: input.device?.hash ?? null, networkHash: input.networkHash },
    });
  } catch {
    /* ignored */
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export async function castVote(input: VoteInput): Promise<VoteResult> {
  const { now } = input;

  if (input.honeypot && input.honeypot.trim() !== "") {
    await record("HONEYPOT", input, null);
    return { ok: false, code: "rejected" };
  }

  if (!input.device) {
    if (input.deviceInvalid) await record("INVALID_DEVICE_TOKEN", input, null);
    return { ok: false, code: "no_device" };
  }
  const device = input.device;

  const poll = await db.poll.findFirst({
    where: { id: input.pollId, deletedAt: null, isHidden: false },
    select: { id: true, status: true, startsAt: true, endsAt: true },
  });
  if (!poll) return { ok: false, code: "not_found" };

  // Decided from the real start and end times, not from a status a job may not have updated.
  if (pollPhase(poll, now) !== "active") {
    await record("NOT_OPEN", input, poll.id);
    return { ok: false, code: "not_open" };
  }

  const ageSeconds = (now.getTime() - device.issuedAt.getTime()) / 1000;
  if (ageSeconds < votingConfig.minDeviceAgeSeconds) {
    await record("TOO_FAST", input, poll.id);
    return { ok: false, code: "too_fast" };
  }

  const option = await db.pollOption.findFirst({ where: { id: input.optionId, pollId: poll.id }, select: { id: true } });
  if (!option) return { ok: false, code: "invalid_option" };

  let codeName: string | null = null;
  if (input.identity === "codename") {
    codeName = cleanCodeName(input.codeName ?? "");
    const length = [...codeName].length;
    if (length < votingConfig.minCodeNameChars || length > votingConfig.maxCodeNameChars) {
      return { ok: false, code: "invalid_code_name" };
    }
  }

  const comment = cleanComment(input.comment ?? "");
  if (comment.length > votingConfig.maxCommentChars || countWords(comment) > votingConfig.maxCommentWords) {
    return { ok: false, code: "invalid_comment" };
  }

  const existing = await db.pollVote.findUnique({
    where: { pollId_deviceHash: { pollId: poll.id, deviceHash: device.hash } },
    select: { id: true },
  });
  if (existing) {
    await record("DUPLICATE_ATTEMPT", input, poll.id);
    return { ok: false, code: "already_voted" };
  }

  const fresh = ageSeconds < votingConfig.freshDeviceMinutes * 60;

  // Network checks are a secondary signal. A long-recognised device is only
  // subject to the generous hourly ceiling; fresh devices (which may be someone
  // who has just cleared their cookies) face a tighter burst limit.
  if (input.networkHash) {
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
    const [rejected, lastHour, freshBurst] = await Promise.all([
      db.pollEvent.count({ where: { networkHash: input.networkHash, createdAt: { gte: minutesAgo(10) } } }),
      db.pollVote.count({ where: { pollId: poll.id, networkHash: input.networkHash, createdAt: { gte: minutesAgo(60) } } }),
      fresh
        ? db.pollVote.count({
            where: {
              pollId: poll.id,
              networkHash: input.networkHash,
              freshDevice: true,
              createdAt: { gte: minutesAgo(votingConfig.freshWindowMinutes) },
            },
          })
        : Promise.resolve(0),
    ]);
    if (rejected >= votingConfig.maxRejectedPerNetwork || lastHour >= votingConfig.maxPerNetworkPerHour) {
      await record("RATE_LIMITED", input, poll.id);
      return { ok: false, code: "rate_limited" };
    }
    if (fresh && freshBurst >= votingConfig.maxFreshVotesPerNetwork) {
      await record("FRESH_DEVICE_BURST", input, poll.id);
      return { ok: false, code: "rate_limited" };
    }
  }

  try {
    // One statement, so the vote and its comment are stored together or not at all.
    const vote = await db.pollVote.create({
      data: {
        pollId: poll.id,
        optionId: option.id,
        deviceHash: device.hash,
        identity: codeName ? "CODE_NAME" : "ANONYMOUS",
        codeName,
        locale: input.locale,
        networkHash: input.networkHash,
        freshDevice: fresh,
        ...(comment ? { comment: { create: { body: comment, flagged: looksSuspicious(comment) } } } : {}),
      },
      select: { id: true },
    });
    return { ok: true, voteId: vote.id, commentPending: comment !== "" };
  } catch (error) {
    // Two requests from the same device raced: the constraint let exactly one through.
    if (isUniqueViolation(error)) {
      await record("DUPLICATE_ATTEMPT", input, poll.id);
      return { ok: false, code: "already_voted" };
    }
    throw error;
  }
}

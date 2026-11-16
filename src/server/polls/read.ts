import "server-only";
import { db } from "@/server/db/client";
import { votingConfig } from "@/config/voting";
import type { Locale } from "@/lib/i18n/config";
import { canSeeResults, pollPhase, type PollPhase } from "@/lib/polls/phase";
import { withPercentages, type PollResults } from "@/lib/polls/results";

/** Uncached, per-request reads for the voting API. */

/** Tally straight from the vote records. There is no stored result to drift out of date. */
export async function getResults(pollId: string, locale: Locale): Promise<PollResults> {
  const [options, counts] = await Promise.all([
    db.pollOption.findMany({
      where: { pollId },
      orderBy: { sortOrder: "asc" },
      include: { translations: true },
    }),
    db.pollVote.groupBy({ by: ["optionId"], where: { pollId }, _count: { _all: true } }),
  ]);
  const votes = new Map(counts.map((c) => [c.optionId, c._count._all]));
  return withPercentages(
    options.map((o) => ({
      optionId: o.id,
      // An option missing a label in this language falls back to the other one rather than vanishing.
      label: (o.translations.find((t) => t.locale === locale) ?? o.translations[0])?.label ?? "",
      votes: votes.get(o.id) ?? 0,
    })),
  );
}

export type PollState = {
  phase: PollPhase;
  hasVoted: boolean;
  votedOptionId: string | null;
  totalVotes: number;
  results: PollResults | null;
};

/** What one device may see and do on one poll right now. Null when the poll is not public. */
export async function getPollState(
  pollId: string,
  locale: Locale,
  deviceHash: string | null,
  now: Date,
): Promise<PollState | null> {
  const poll = await db.poll.findFirst({
    where: { id: pollId, deletedAt: null, isHidden: false, status: { not: "DRAFT" } },
    select: { id: true, status: true, startsAt: true, endsAt: true, resultsVisibility: true },
  });
  if (!poll) return null;

  const phase = pollPhase(poll, now);
  const vote = deviceHash
    ? await db.pollVote.findUnique({
        where: { pollId_deviceHash: { pollId, deviceHash } },
        select: { optionId: true },
      })
    : null;
  const visible = canSeeResults(phase, poll.resultsVisibility, vote !== null);
  const results = visible ? await getResults(pollId, locale) : null;
  const totalVotes = results ? results.total : await db.pollVote.count({ where: { pollId } });

  return { phase, hasVoted: vote !== null, votedOptionId: vote?.optionId ?? null, totalVotes, results };
}

export type PublicComment = { id: string; name: string | null; body: string; createdAt: string };

/** Approved comments only, newest first. Exposes the display name and text, nothing else. */
export async function getApprovedComments(
  pollId: string,
  cursor: string | null,
): Promise<{ comments: PublicComment[]; nextCursor: string | null }> {
  const take = votingConfig.commentsPageSize;
  const rows = await db.pollComment.findMany({
    where: { status: "APPROVED", vote: { pollId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, body: true, createdAt: true, vote: { select: { identity: true, codeName: true } } },
  });
  const page = rows.slice(0, take);
  return {
    comments: page.map((c) => ({
      id: c.id,
      name: c.vote.identity === "CODE_NAME" ? c.vote.codeName : null,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}

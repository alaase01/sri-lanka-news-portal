export type PollPhase = "draft" | "upcoming" | "active" | "closed" | "archived";

type PollTiming = { status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "ARCHIVED"; startsAt: Date; endsAt: Date };

/**
 * What a poll is doing right now. The stored status says what the administrator
 * intended; the start and end times decide whether voting is actually open.
 * A published poll therefore opens and closes on time with no background job.
 */
export function pollPhase(poll: PollTiming, now: Date): PollPhase {
  if (poll.status === "DRAFT") return "draft";
  if (poll.status === "ARCHIVED") return "archived";
  if (poll.status === "CLOSED") return "closed";
  if (now < poll.startsAt) return "upcoming";
  if (now >= poll.endsAt) return "closed";
  return "active";
}

export type ResultsVisibility = "ALWAYS" | "AFTER_VOTE" | "AFTER_CLOSE";

export function canSeeResults(phase: PollPhase, visibility: ResultsVisibility, hasVoted: boolean): boolean {
  if (phase === "closed" || phase === "archived") return true;
  if (phase !== "active") return false;
  if (visibility === "ALWAYS") return true;
  if (visibility === "AFTER_VOTE") return hasVoted;
  return false;
}

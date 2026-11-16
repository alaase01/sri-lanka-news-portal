/**
 * Voting limits. Every value can be overridden with an environment variable of
 * the same name prefixed VOTE_ (for example VOTE_MAX_PER_NETWORK_PER_HOUR=120).
 *
 * The network limits are deliberately generous: many legitimate voters share
 * one public address (a home, an office, a university, a mobile carrier).
 * They exist to slow automated abuse, not to enforce one vote per address.
 */

function int(name: string, fallback: number): number {
  const n = Number(process.env[`VOTE_${name}`]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export const votingConfig = {
  /** A device token must be at least this old before it can vote (blocks scripted fetch-then-vote). */
  minDeviceAgeSeconds: int("MIN_DEVICE_AGE_SECONDS", 3),
  /** A token younger than this is "fresh": it may be a new visitor, or someone who cleared cookies. */
  freshDeviceMinutes: int("FRESH_DEVICE_MINUTES", 10),
  /** Votes accepted from fresh devices on one network, per poll, within the window below. */
  maxFreshVotesPerNetwork: int("MAX_FRESH_VOTES_PER_NETWORK", 5),
  freshWindowMinutes: int("FRESH_WINDOW_MINUTES", 10),
  /** All votes accepted from one network, per poll, per hour. */
  maxPerNetworkPerHour: int("MAX_PER_NETWORK_PER_HOUR", 60),
  /** Rejected attempts from one network within ten minutes before it is paused. */
  maxRejectedPerNetwork: int("MAX_REJECTED_PER_NETWORK", 30),
  /** Cookie lifetime. Browsers cap this at about 400 days; it is renewed on every visit. */
  deviceCookieDays: int("DEVICE_COOKIE_DAYS", 400),
  maxCommentWords: 400,
  maxCommentChars: 6000,
  maxCodeNameChars: 40,
  minCodeNameChars: 2,
  commentsPageSize: 10,
} as const;

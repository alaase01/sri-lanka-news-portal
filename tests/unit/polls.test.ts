import { describe, expect, it } from "vitest";
import { canSeeResults, pollPhase } from "@/lib/polls/phase";
import { withPercentages } from "@/lib/polls/results";
import { cleanCodeName, cleanComment, countWords, looksSuspicious } from "@/lib/polls/text";
import { issueDeviceCookie, networkHash, parseDeviceCookie } from "@/server/polls/device";

const at = (iso: string) => new Date(iso);

describe("pollPhase", () => {
  const poll = { status: "ACTIVE" as const, startsAt: at("2026-01-10T00:00:00Z"), endsAt: at("2026-01-20T00:00:00Z") };

  it("follows the start and end times, not the stored status", () => {
    expect(pollPhase(poll, at("2026-01-09T23:59:59Z"))).toBe("upcoming");
    expect(pollPhase(poll, at("2026-01-10T00:00:00Z"))).toBe("active");
    expect(pollPhase(poll, at("2026-01-19T23:59:59Z"))).toBe("active");
    expect(pollPhase(poll, at("2026-01-20T00:00:00Z"))).toBe("closed");
  });

  it("opens a scheduled poll at its start time with no status change", () => {
    expect(pollPhase({ ...poll, status: "SCHEDULED" }, at("2026-01-15T00:00:00Z"))).toBe("active");
  });

  it("keeps draft, closed and archived polls shut whatever the time", () => {
    const during = at("2026-01-15T00:00:00Z");
    expect(pollPhase({ ...poll, status: "DRAFT" }, during)).toBe("draft");
    expect(pollPhase({ ...poll, status: "CLOSED" }, during)).toBe("closed");
    expect(pollPhase({ ...poll, status: "ARCHIVED" }, during)).toBe("archived");
  });
});

describe("canSeeResults", () => {
  it("shows results after voting by default, and to everyone once closed", () => {
    expect(canSeeResults("active", "AFTER_VOTE", false)).toBe(false);
    expect(canSeeResults("active", "AFTER_VOTE", true)).toBe(true);
    expect(canSeeResults("closed", "AFTER_VOTE", false)).toBe(true);
  });
  it("honours ALWAYS and AFTER_CLOSE", () => {
    expect(canSeeResults("active", "ALWAYS", false)).toBe(true);
    expect(canSeeResults("active", "AFTER_CLOSE", true)).toBe(false);
    expect(canSeeResults("closed", "AFTER_CLOSE", false)).toBe(true);
  });
  it("never shows results for a poll that has not started", () => {
    expect(canSeeResults("upcoming", "ALWAYS", false)).toBe(false);
  });
});

describe("withPercentages", () => {
  const opts = (...votes: number[]) => votes.map((v, i) => ({ optionId: `o${i}`, label: `L${i}`, votes: v }));

  it("matches the example in the specification", () => {
    const r = withPercentages(opts(450, 250, 200, 100));
    expect(r.total).toBe(1000);
    expect(r.options.map((o) => o.percent)).toEqual([45, 25, 20, 10]);
  });
  it("always totals 100 when rounding would not", () => {
    for (const votes of [[1, 1, 1], [2, 2, 3], [1, 1, 1, 1, 1, 1], [333, 333, 334], [7, 0, 0], [1, 2, 3, 5, 8, 13]]) {
      const r = withPercentages(opts(...votes));
      expect(r.options.reduce((s, o) => s + o.percent, 0)).toBe(100);
    }
  });
  it("gives zeros, not NaN, when nobody has voted", () => {
    const r = withPercentages(opts(0, 0));
    expect(r.total).toBe(0);
    expect(r.options.map((o) => o.percent)).toEqual([0, 0]);
  });
});

describe("comment and code-name text", () => {
  it("counts Sinhala and English words by spaces", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one two  three\nfour")).toBe(4);
    expect(countWords("ශ්‍රී ලංකාවේ ආර්ථිකය දියුණු විය යුතුයි")).toBe(6);
  });
  it("keeps the zero-width joiner that Sinhala conjuncts need", () => {
    expect(cleanComment("ශ්‍රී")).toBe("ශ්‍රී");
  });
  it("strips control and direction-override characters", () => {
    expect(cleanCodeName("  Kamal‮  \u0000Perera ")).toBe("Kamal Perera");
    expect(cleanComment("a\r\nb\n\n\n\nc")).toBe("a\nb\n\nc");
  });
  it("flags links, markup and long repeats for the moderator", () => {
    expect(looksSuspicious("visit https://example.com now")).toBe(true);
    expect(looksSuspicious("<script>alert(1)</script>")).toBe(true);
    expect(looksSuspicious("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(looksSuspicious("මම මේ අදහසට එකඟයි.")).toBe(false);
  });
});

describe("device cookie", () => {
  const now = at("2026-06-01T12:00:00Z");

  it("accepts a cookie this server issued and derives a stable hash", () => {
    const issued = issueDeviceCookie(now);
    const a = parseDeviceCookie(issued.value, now);
    const b = parseDeviceCookie(issued.value, at("2026-09-01T12:00:00Z"));
    expect(a.status).toBe("valid");
    expect(a.status === "valid" && b.status === "valid" && a.device.hash === b.device.hash).toBe(true);
    expect(a.status === "valid" && a.device.hash).toBe(issued.device.hash);
  });
  it("gives every device a different, unpredictable token", () => {
    const hashes = new Set(Array.from({ length: 200 }, () => issueDeviceCookie(now).device.hash));
    expect(hashes.size).toBe(200);
  });
  it("never stores the token itself as the hash", () => {
    const issued = issueDeviceCookie(now);
    expect(issued.value).not.toContain(issued.device.hash);
    expect(issued.device.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects missing, made-up and edited values", () => {
    const issued = issueDeviceCookie(now).value;
    const [token, ts, sig] = issued.split(".");
    expect(parseDeviceCookie(undefined, now).status).toBe("missing");
    expect(parseDeviceCookie("hello", now).status).toBe("invalid");
    expect(parseDeviceCookie(`${"A".repeat(43)}.${ts}.${sig}`, now).status).toBe("invalid");
    expect(parseDeviceCookie(`${token}.${Number(ts) - 86400}.${sig}`, now).status).toBe("invalid");
    expect(parseDeviceCookie(`${token}.${ts}.${sig.slice(0, -2)}AA`, now).status).toBe("invalid");
    expect(parseDeviceCookie(`${token}.${ts}`, now).status).toBe("invalid");
  });
  it("rejects a token dated in the future", () => {
    const future = issueDeviceCookie(at("2026-06-02T12:00:00Z")).value;
    expect(parseDeviceCookie(future, now).status).toBe("invalid");
  });
});

describe("networkHash", () => {
  const day1 = at("2026-06-01T12:00:00Z");
  it("is stable within a day and different the next day", () => {
    expect(networkHash("203.0.113.7", day1)).toBe(networkHash("203.0.113.7", at("2026-06-01T23:00:00Z")));
    expect(networkHash("203.0.113.7", day1)).not.toBe(networkHash("203.0.113.7", at("2026-06-02T01:00:00Z")));
  });
  it("does not contain the address and groups an IPv6 /64", () => {
    expect(networkHash("203.0.113.7", day1)).not.toContain("203");
    expect(networkHash("2001:db8:1:2:aaaa::1", day1)).toBe(networkHash("2001:db8:1:2:bbbb::9", day1));
    expect(networkHash("2001:db8:1:2::1", day1)).not.toBe(networkHash("2001:db8:1:3::1", day1));
  });
  it("returns null for a missing or malformed address", () => {
    expect(networkHash(null, day1)).toBeNull();
    expect(networkHash("not an ip!", day1)).toBeNull();
  });
});

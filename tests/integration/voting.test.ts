import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { issueDeviceCookie, parseDeviceCookie, type Device } from "@/server/polls/device";
import { getApprovedComments, getPollState, getResults } from "@/server/polls/read";
import { castVote, type VoteInput } from "@/server/polls/vote";

/**
 * Voting engine tests against a real PostgreSQL database (DATABASE_URL).
 * They create their own polls with a unique prefix and remove them afterwards.
 */

const RUN = `t${Date.now().toString(36)}`;
const NOW = new Date();
const HOUR = 3_600_000;

type TestPoll = { id: string; options: string[] };

async function makePoll(
  name: string,
  overrides: Partial<{ status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "ARCHIVED"; startsAt: Date; endsAt: Date; isHidden: boolean; visibility: "ALWAYS" | "AFTER_VOTE" | "AFTER_CLOSE"; optionCount: number }> = {},
): Promise<TestPoll> {
  const count = overrides.optionCount ?? 3;
  const poll = await db.poll.create({
    data: {
      slug: `${RUN}-${name}`,
      status: overrides.status ?? "ACTIVE",
      isHidden: overrides.isHidden ?? false,
      startsAt: overrides.startsAt ?? new Date(NOW.getTime() - HOUR),
      endsAt: overrides.endsAt ?? new Date(NOW.getTime() + HOUR),
      resultsVisibility: overrides.visibility ?? "AFTER_VOTE",
      translations: {
        create: [
          { locale: "si", question: `පරීක්ෂණ ${name}` },
          { locale: "en", question: `Test ${name}` },
        ],
      },
      options: {
        create: Array.from({ length: count }, (_, i) => ({
          sortOrder: i,
          translations: { create: [{ locale: "si", label: `විකල්පය ${i + 1}` }, { locale: "en", label: `Option ${i + 1}` }] },
        })),
      },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  return { id: poll.id, options: poll.options.map((o) => o.id) };
}

/** A device whose cookie was issued `ageSeconds` ago (default: a day, so it is not "fresh"). */
function device(ageSeconds = 86_400): Device {
  return issueDeviceCookie(new Date(NOW.getTime() - ageSeconds * 1000)).device;
}

function vote(poll: TestPoll, dev: Device | null, extra: Partial<VoteInput> = {}): Promise<Awaited<ReturnType<typeof castVote>>> {
  return castVote({
    pollId: poll.id,
    optionId: poll.options[0],
    identity: "anonymous",
    locale: "si",
    device: dev,
    deviceInvalid: false,
    networkHash: null,
    now: NOW,
    ...extra,
  });
}

const count = (pollId: string) => db.pollVote.count({ where: { pollId } });

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  const polls = await db.poll.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const ids = polls.map((p) => p.id);
  await db.pollVote.deleteMany({ where: { pollId: { in: ids } } });
  await db.pollEvent.deleteMany({ where: { pollId: { in: ids } } });
  await db.pollEvent.deleteMany({ where: { networkHash: { startsWith: RUN } } });
  await db.poll.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("casting a vote", () => {
  it("accepts an anonymous vote", async () => {
    const poll = await makePoll("anon");
    const result = await vote(poll, device());
    expect(result.ok).toBe(true);
    const row = await db.pollVote.findFirstOrThrow({ where: { pollId: poll.id } });
    expect(row.identity).toBe("ANONYMOUS");
    expect(row.codeName).toBeNull();
  });

  it("accepts a code-name vote and stores the cleaned name", async () => {
    const poll = await makePoll("codename");
    const result = await vote(poll, device(), { identity: "codename", codeName: "  සුනිල්   Perera " });
    expect(result.ok).toBe(true);
    const row = await db.pollVote.findFirstOrThrow({ where: { pollId: poll.id } });
    expect(row.identity).toBe("CODE_NAME");
    expect(row.codeName).toBe("සුනිල් Perera");
  });

  it("rejects a code name that is empty or too long", async () => {
    const poll = await makePoll("badname");
    expect(await vote(poll, device(), { identity: "codename", codeName: " " })).toEqual({ ok: false, code: "invalid_code_name" });
    expect(await vote(poll, device(), { identity: "codename", codeName: "x".repeat(41) })).toEqual({ ok: false, code: "invalid_code_name" });
    expect(await count(poll.id)).toBe(0);
  });

  it("stores only a hash of the device, never anything that identifies the visitor", async () => {
    const poll = await makePoll("privacy");
    const dev = device();
    await vote(poll, dev, { networkHash: `${RUN}-net-privacy` });
    const row = await db.pollVote.findFirstOrThrow({ where: { pollId: poll.id } });
    expect(row.deviceHash).toBe(dev.hash);
    expect(row.deviceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(row).sort()).toEqual(
      ["codeName", "createdAt", "deviceHash", "freshDevice", "id", "identity", "locale", "networkHash", "optionId", "pollId"].sort(),
    );
  });
});

describe("one vote per recognised device per poll", () => {
  it("rejects a second vote from the same device", async () => {
    const poll = await makePoll("twice");
    const dev = device();
    expect((await vote(poll, dev)).ok).toBe(true);
    expect(await vote(poll, dev, { optionId: poll.options[1] })).toEqual({ ok: false, code: "already_voted" });
    expect(await count(poll.id)).toBe(1);
  });

  it("lets the same device vote in a different poll", async () => {
    const a = await makePoll("multi-a");
    const b = await makePoll("multi-b");
    const dev = device();
    expect((await vote(a, dev)).ok).toBe(true);
    expect((await vote(b, dev)).ok).toBe(true);
  });

  it("does not allow another vote by changing the code name", async () => {
    const poll = await makePoll("rename");
    const dev = device();
    await vote(poll, dev, { identity: "codename", codeName: "Kamal" });
    expect(await vote(poll, dev, { identity: "codename", codeName: "Nimal" })).toEqual({ ok: false, code: "already_voted" });
    expect(await count(poll.id)).toBe(1);
  });

  it("does not allow another vote by switching between anonymous and code name", async () => {
    const poll = await makePoll("switch");
    const dev = device();
    await vote(poll, dev);
    expect(await vote(poll, dev, { identity: "codename", codeName: "Kamal" })).toEqual({ ok: false, code: "already_voted" });
    const other = device();
    await vote(poll, other, { identity: "codename", codeName: "Kamal" });
    expect(await vote(poll, other)).toEqual({ ok: false, code: "already_voted" });
    expect(await count(poll.id)).toBe(2);
  });

  it("counts exactly one vote when the same device submits 25 times at once", async () => {
    const poll = await makePoll("race");
    const dev = device();
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => vote(poll, dev, { optionId: poll.options[i % 3] })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "already_voted")).toHaveLength(24);
    expect(await count(poll.id)).toBe(1);
  });

  it("is enforced by the database even if application checks are bypassed", async () => {
    const poll = await makePoll("constraint");
    const row = { pollId: poll.id, optionId: poll.options[0], deviceHash: "a".repeat(64), locale: "si" as const };
    await db.pollVote.create({ data: row });
    await expect(db.pollVote.create({ data: { ...row, optionId: poll.options[1] } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("records repeated attempts for the administrator", async () => {
    const poll = await makePoll("attempts");
    const dev = device();
    await vote(poll, dev);
    await vote(poll, dev);
    await vote(poll, dev);
    expect(await db.pollEvent.count({ where: { pollId: poll.id, type: "DUPLICATE_ATTEMPT" } })).toBe(2);
  });

  it("treats different browsers (different tokens) as different devices", async () => {
    const poll = await makePoll("browsers");
    expect((await vote(poll, device())).ok).toBe(true);
    expect((await vote(poll, device())).ok).toBe(true);
    expect(await count(poll.id)).toBe(2);
  });
});

describe("poll lifecycle", () => {
  const cases = [
    ["upcoming", { status: "SCHEDULED", startsAt: new Date(NOW.getTime() + HOUR), endsAt: new Date(NOW.getTime() + 2 * HOUR) }],
    ["expired", { status: "ACTIVE", startsAt: new Date(NOW.getTime() - 2 * HOUR), endsAt: new Date(NOW.getTime() - 1000) }],
    ["closed-by-admin", { status: "CLOSED" }],
    ["archived", { status: "ARCHIVED" }],
    ["draft", { status: "DRAFT" }],
  ] as const;

  for (const [name, overrides] of cases) {
    it(`rejects a vote on a poll that is ${name}`, async () => {
      const poll = await makePoll(`life-${name}`, overrides);
      expect(await vote(poll, device())).toEqual({ ok: false, code: "not_open" });
      expect(await count(poll.id)).toBe(0);
    });
  }

  it("rejects a vote on a hidden poll without revealing that it exists", async () => {
    const poll = await makePoll("hidden", { isHidden: true });
    expect(await vote(poll, device())).toEqual({ ok: false, code: "not_found" });
    expect(await getPollState(poll.id, "si", null, NOW)).toBeNull();
  });

  it("accepts a vote on a scheduled poll once its start time has passed", async () => {
    const poll = await makePoll("auto-open", { status: "SCHEDULED" });
    expect((await vote(poll, device())).ok).toBe(true);
  });

  it("rejects an option that belongs to another poll, and the database agrees", async () => {
    const a = await makePoll("opt-a");
    const b = await makePoll("opt-b");
    expect(await vote(a, device(), { optionId: b.options[0] })).toEqual({ ok: false, code: "invalid_option" });
    await expect(
      db.pollVote.create({ data: { pollId: a.id, optionId: b.options[0], deviceHash: "b".repeat(64), locale: "si" } }),
    ).rejects.toBeTruthy();
  });

  it("rejects a poll that does not exist", async () => {
    expect(await vote({ id: "c".repeat(25), options: ["d".repeat(25)] }, device())).toEqual({ ok: false, code: "not_found" });
  });
});

describe("device recognition", () => {
  it("refuses a vote with no device cookie", async () => {
    const poll = await makePoll("nodevice");
    expect(await vote(poll, null)).toEqual({ ok: false, code: "no_device" });
  });

  it("refuses and logs a vote with a tampered cookie", async () => {
    const poll = await makePoll("tampered");
    const forged = parseDeviceCookie(`${"A".repeat(43)}.1700000000.${"B".repeat(43)}`, NOW);
    expect(forged.status).toBe("invalid");
    const before = await db.pollEvent.count({ where: { type: "INVALID_DEVICE_TOKEN" } });
    expect(await vote(poll, null, { deviceInvalid: true })).toEqual({ ok: false, code: "no_device" });
    expect(await db.pollEvent.count({ where: { type: "INVALID_DEVICE_TOKEN" } })).toBe(before + 1);
  });

  it("refuses a vote from a token issued a moment ago (scripted fetch-then-vote)", async () => {
    const poll = await makePoll("toofast");
    expect(await vote(poll, device(1))).toEqual({ ok: false, code: "too_fast" });
    expect((await vote(poll, device(5))).ok).toBe(true);
  });

  it("limits a burst of brand-new devices on one network (cookie clearing)", async () => {
    const poll = await makePoll("burst", { optionCount: 2 });
    const net = `${RUN}-net-burst`;
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await vote(poll, device(30), { networkHash: net }));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.slice(5).every((r) => !r.ok && r.code === "rate_limited")).toBe(true);
    expect(await db.pollEvent.count({ where: { pollId: poll.id, type: "FRESH_DEVICE_BURST" } })).toBe(3);
  });

  it("still lets long-recognised devices vote from that same busy network", async () => {
    const poll = await makePoll("household", { optionCount: 2 });
    const net = `${RUN}-net-house`;
    for (let i = 0; i < 5; i++) await vote(poll, device(30), { networkHash: net });
    expect((await vote(poll, device(30), { networkHash: net })).ok).toBe(false);
    // A family member whose browser has been recognised for days is not blocked.
    for (let i = 0; i < 10; i++) expect((await vote(poll, device(3 * 86_400), { networkHash: net })).ok).toBe(true);
    expect(await count(poll.id)).toBe(15);
  });

  it("does not limit by network when no address is known", async () => {
    const poll = await makePoll("nonet", { optionCount: 2 });
    for (let i = 0; i < 8; i++) expect((await vote(poll, device(30))).ok).toBe(true);
  });

  it("drops a submission that fills the hidden field", async () => {
    const poll = await makePoll("honeypot");
    expect(await vote(poll, device(), { honeypot: "http://spam.example" })).toEqual({ ok: false, code: "rejected" });
    expect(await count(poll.id)).toBe(0);
  });
});

describe("results", () => {
  it("are calculated from vote records and add up", async () => {
    const poll = await makePoll("tally", { optionCount: 4 });
    const plan = [9, 5, 4, 2];
    for (const [i, n] of plan.entries()) {
      for (let k = 0; k < n; k++) await vote(poll, device(), { optionId: poll.options[i] });
    }
    const results = await getResults(poll.id, "en");
    expect(results.total).toBe(20);
    expect(results.options.map((o) => o.votes)).toEqual(plan);
    expect(results.options.map((o) => o.percent)).toEqual([45, 25, 20, 10]);
    expect(results.options[0].label).toBe("Option 1");
  });

  it("share one voting population across the Sinhala and English editions", async () => {
    const poll = await makePoll("editions");
    const dev = device();
    await vote(poll, dev, { locale: "si" });
    await vote(poll, device(), { locale: "en" });
    // The same device cannot vote again from the other edition.
    expect(await vote(poll, dev, { locale: "en" })).toEqual({ ok: false, code: "already_voted" });
    const si = await getResults(poll.id, "si");
    const en = await getResults(poll.id, "en");
    expect(si.total).toBe(2);
    expect(en.total).toBe(2);
    expect(si.options.map((o) => o.votes)).toEqual(en.options.map((o) => o.votes));
    expect(si.options[0].label).toBe("විකල්පය 1");
  });

  it("are hidden until the device has voted, by default", async () => {
    const poll = await makePoll("visibility");
    const dev = device();
    const before = await getPollState(poll.id, "si", dev.hash, NOW);
    expect(before).toMatchObject({ phase: "active", hasVoted: false, results: null });
    await vote(poll, dev, { optionId: poll.options[2] });
    const after = await getPollState(poll.id, "si", dev.hash, NOW);
    expect(after).toMatchObject({ phase: "active", hasVoted: true, votedOptionId: poll.options[2], totalVotes: 1 });
    expect(after?.results?.total).toBe(1);
    // Another device still cannot see them.
    expect((await getPollState(poll.id, "si", device().hash, NOW))?.results).toBeNull();
  });

  it("are shown to everyone once the poll has closed", async () => {
    const poll = await makePoll("final");
    await vote(poll, device());
    await db.poll.update({ where: { id: poll.id }, data: { status: "CLOSED" } });
    const state = await getPollState(poll.id, "si", null, NOW);
    expect(state?.phase).toBe("closed");
    expect(state?.results?.total).toBe(1);
  });

  it("never include voter identifiers", async () => {
    const poll = await makePoll("leak");
    const dev = device();
    await vote(poll, dev, { identity: "codename", codeName: "Secret Name", networkHash: `${RUN}-net-leak` });
    const text = JSON.stringify(await getPollState(poll.id, "si", dev.hash, NOW));
    expect(text).not.toContain(dev.hash);
    expect(text).not.toContain("net-leak");
    expect(text).not.toContain("Secret Name");
  });
});

describe("comments", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `වචනය${i}`).join(" ");

  it("accepts 400 words and rejects 401, without counting the rejected vote", async () => {
    const poll = await makePoll("words");
    expect(await vote(poll, device(), { comment: words(401) })).toEqual({ ok: false, code: "invalid_comment" });
    expect(await count(poll.id)).toBe(0);
    expect((await vote(poll, device(), { comment: words(400) })).ok).toBe(true);
  });

  it("are optional", async () => {
    const poll = await makePoll("nocomment");
    const result = await vote(poll, device(), { comment: "   " });
    expect(result).toMatchObject({ ok: true, commentPending: false });
    expect(await db.pollComment.count({ where: { vote: { pollId: poll.id } } })).toBe(0);
  });

  it("start as pending, stay private, and the vote counts meanwhile", async () => {
    const poll = await makePoll("pending");
    const result = await vote(poll, device(), { comment: "හොඳ යෝජනාවක්." });
    expect(result).toMatchObject({ ok: true, commentPending: true });
    const comment = await db.pollComment.findFirstOrThrow({ where: { vote: { pollId: poll.id } } });
    expect(comment.status).toBe("PENDING");
    expect((await getApprovedComments(poll.id, null)).comments).toHaveLength(0);
    expect(await count(poll.id)).toBe(1);
  });

  it("appear once approved, under the code name or as anonymous, with nothing internal", async () => {
    const poll = await makePoll("approved");
    await vote(poll, device(), { identity: "codename", codeName: "Kamal", comment: "First" });
    await vote(poll, device(), { comment: "Second" });
    await db.pollComment.updateMany({ where: { vote: { pollId: poll.id } }, data: { status: "APPROVED" } });
    const { comments } = await getApprovedComments(poll.id, null);
    expect(comments.map((c) => c.name).sort()).toEqual([null, "Kamal"].sort());
    for (const c of comments) expect(Object.keys(c).sort()).toEqual(["body", "createdAt", "id", "name"]);
  });

  it("disappear when hidden, and deleting one never changes the vote count", async () => {
    const poll = await makePoll("moderate");
    await vote(poll, device(), { comment: "Keep" });
    await vote(poll, device(), { comment: "Hide" });
    await vote(poll, device(), { comment: "Delete" });
    await db.pollComment.updateMany({ where: { vote: { pollId: poll.id } }, data: { status: "APPROVED" } });
    await db.pollComment.updateMany({ where: { body: "Hide", vote: { pollId: poll.id } }, data: { status: "HIDDEN" } });
    await db.pollComment.deleteMany({ where: { body: "Delete", vote: { pollId: poll.id } } });
    expect((await getApprovedComments(poll.id, null)).comments.map((c) => c.body)).toEqual(["Keep"]);
    expect(await count(poll.id)).toBe(3);
    expect((await getResults(poll.id, "si")).total).toBe(3);
  });

  it("store markup as plain text and flag it for review", async () => {
    const poll = await makePoll("xss");
    const payload = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
    expect((await vote(poll, device(), { comment: payload })).ok).toBe(true);
    const comment = await db.pollComment.findFirstOrThrow({ where: { vote: { pollId: poll.id } } });
    expect(comment.body).toBe(payload);
    expect(comment.flagged).toBe(true);
    expect(comment.status).toBe("PENDING");
  });

  it("are paginated", async () => {
    const poll = await makePoll("pages");
    for (let i = 0; i < 23; i++) await vote(poll, device(), { comment: `Comment ${i}` });
    await db.pollComment.updateMany({ where: { vote: { pollId: poll.id } }, data: { status: "APPROVED" } });
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof getApprovedComments>> = await getApprovedComments(poll.id, cursor);
      expect(page.comments.length).toBeLessThanOrEqual(10);
      page.comments.forEach((c) => seen.add(c.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen.size).toBe(23);
  });
});

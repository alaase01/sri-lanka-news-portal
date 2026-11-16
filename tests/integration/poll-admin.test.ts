import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { changePollState, getPollForEdit, getPollReport, listComments, listPolls, moderateComments, reopenPoll, savePoll, type PollInput } from "@/server/admin/polls";
import { getApprovedComments } from "@/server/polls/read";

/**
 * Poll administration against a real database. Polls use a run-specific slug
 * prefix; votes are inserted directly (the voting engine has its own tests).
 */

const RUN = `t${Date.now().toString(36)}`;
const NOW = new Date("2026-11-16T06:00:00Z");
const H = 3_600_000;
let n = 0;
const at = (h: number) => new Date(NOW.getTime() + h * H);
const text = (q: string) => ({ question: q, description: "", seoTitle: "", metaDescription: "" });
const blank = text("");

function input(over: Partial<PollInput> = {}): PollInput {
  return {
    id: null,
    expectedUpdatedAt: null,
    intent: "save",
    slug: `${RUN}-poll-${n++}`,
    startsAt: at(1),
    endsAt: at(48),
    resultsVisibility: "AFTER_VOTE",
    featuredMediaId: null,
    si: text("ප්‍රශ්නය?"),
    en: blank,
    options: [
      { id: null, si: "ඔව්", en: "" },
      { id: null, si: "නැත", en: "" },
    ],
    ...over,
  };
}

/** Re-reads a poll and builds a save input from it, ready to modify. */
async function edit(id: string, now = NOW): Promise<PollInput> {
  const p = (await getPollForEdit(id, now))!;
  return {
    id,
    expectedUpdatedAt: p.updatedAt.toISOString(),
    intent: "save",
    slug: p.slug,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    resultsVisibility: p.resultsVisibility,
    featuredMediaId: p.featuredMediaId,
    si: p.translations.si ?? blank,
    en: p.translations.en ?? blank,
    options: p.options.map((o) => ({ id: o.id, si: o.si, en: o.en })),
  };
}

async function create(over: Partial<PollInput> = {}) {
  const r = await savePoll(input(over), NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.id;
}

async function vote(pollId: string, optionIndex: number, extra: { codeName?: string; comment?: string; flagged?: boolean; locale?: "si" | "en" } = {}) {
  const p = (await getPollForEdit(pollId, NOW))!;
  return db.pollVote.create({
    data: {
      pollId,
      optionId: p.options[optionIndex].id,
      deviceHash: `${RUN}-dev-${n++}`,
      locale: extra.locale ?? "si",
      identity: extra.codeName ? "CODE_NAME" : "ANONYMOUS",
      codeName: extra.codeName ?? null,
      ...(extra.comment ? { comment: { create: { body: extra.comment, flagged: extra.flagged ?? false } } } : {}),
    },
  });
}

afterAll(async () => {
  const polls = await db.poll.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const ids = polls.map((p) => p.id);
  await db.pollVote.deleteMany({ where: { pollId: { in: ids } } });
  await db.poll.deleteMany({ where: { id: { in: ids } } });
});

describe("creating polls", () => {
  it("creates a Sinhala-only draft", async () => {
    const id = await create();
    const p = await getPollForEdit(id, NOW);
    expect(p?.status).toBe("DRAFT");
    expect(p?.translations.en).toBeNull();
    expect(p?.options.map((o) => o.si)).toEqual(["ඔව්", "නැත"]);
  });

  it("validates questions, answers, slug and times", async () => {
    const taken = `${RUN}-taken`;
    await create({ slug: taken });
    const cases: [Partial<PollInput>, string][] = [
      [{ si: blank }, "si.question"],
      [{ en: text("Question?") }, "options.0.en"],
      [{ options: [{ id: null, si: "x", en: "" }] }, "options"],
      [{ options: Array.from({ length: 11 }, (_, i) => ({ id: null, si: `o${i}`, en: "" })) }, "options"],
      [{ options: [{ id: null, si: "ඔව්", en: "" }, { id: null, si: "ඔව්", en: "" }] }, "options"],
      [{ options: [{ id: null, si: "", en: "" }, { id: null, si: "x", en: "" }] }, "options.0.si"],
      [{ slug: "Bad slug" }, "slug"],
      [{ slug: "page" }, "slug"],
      [{ slug: taken }, "slug"],
      [{ endsAt: at(0.5) }, "endsAt"],
      [{ endsAt: at(24 * 400) }, "endsAt"],
      [{ startsAt: null }, "startsAt"],
      [{ options: [{ id: "someoneelses", si: "a", en: "" }, { id: null, si: "b", en: "" }] }, "options"],
    ];
    for (const [over, field] of cases) {
      const r = await savePoll(input(over), NOW);
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(r.errors[field], field).toBeTruthy();
    }
  });

  it("refuses to publish a poll whose closing time has passed", async () => {
    const r = await savePoll(input({ intent: "publish", startsAt: at(-48), endsAt: at(-1) }), NOW);
    expect(!r.ok && r.errors.endsAt).toBeTruthy();
  });

  it("stores both editions when English is complete", async () => {
    const id = await create({ en: text("Question?"), options: [{ id: null, si: "ඔව්", en: "Yes" }, { id: null, si: "නැත", en: "No" }] });
    const p = await getPollForEdit(id, NOW);
    expect(p?.translations.en?.question).toBe("Question?");
    expect(p?.options.map((o) => o.en)).toEqual(["Yes", "No"]);
  });
});

describe("editing", () => {
  it("allows any change to a draft: reorder, add, remove, slug", async () => {
    const id = await create();
    const e = await edit(id);
    const r = await savePoll({ ...e, slug: `${RUN}-renamed-${n++}`, options: [e.options[1], { id: null, si: "නොදනිමි", en: "" }] }, NOW);
    expect(r.ok).toBe(true);
    const p = await getPollForEdit(id, NOW);
    expect(p?.options.map((o) => o.si)).toEqual(["නැත", "නොදනිමි"]);
  });

  it("refuses a save based on an outdated copy", async () => {
    const id = await create();
    const stale = await edit(id);
    expect((await savePoll({ ...(await edit(id)), si: text("first tab") }, NOW)).ok).toBe(true);
    const r = await savePoll({ ...stale, si: text("second tab") }, NOW);
    expect(r.ok).toBe(false);
    expect((await getPollForEdit(id, NOW))?.translations.si?.question).toBe("first tab");
  });

  it("publishes, then keeps the slug", async () => {
    const id = await create();
    const r = await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    expect(r.ok && r.status).toBe("ACTIVE");
    const slug = await savePoll({ ...(await edit(id)), slug: `${RUN}-other-${n++}` }, NOW);
    expect(!slug.ok && slug.errors.slug).toBeTruthy();
  });

  it("locks answers and opening time once votes exist, but allows rewording and a new closing time", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    const v1 = await vote(id, 0);
    const v2 = await vote(id, 1);
    const p = (await getPollForEdit(id, NOW))!;
    expect(p.locked).toBe(true);

    const e = await edit(id);
    const changes: [string, Partial<PollInput>][] = [
      ["reorder", { options: [e.options[1], e.options[0]] }],
      ["remove", { options: [e.options[0]] }],
      ["add", { options: [...e.options, { id: null, si: "නව", en: "" }] }],
      ["start", { startsAt: at(-2) }],
    ];
    for (const [label, change] of changes) {
      const r = await savePoll({ ...(await edit(id)), ...change }, NOW);
      expect(r.ok, label).toBe(false);
    }
    const reword = await savePoll({ ...(await edit(id)), options: e.options.map((o, i) => ({ ...o, si: i === 0 ? "ඔව්, නිසැකවම" : o.si })), endsAt: at(96) }, NOW);
    expect(reword.ok).toBe(true);
    const after = (await getPollForEdit(id, NOW))!;
    expect(after.options[0].si).toBe("ඔව්, නිසැකවම");
    expect(after.endsAt).toEqual(at(96));
    // The votes themselves are untouched.
    const votes = await db.pollVote.findMany({ where: { id: { in: [v1.id, v2.id] } }, orderBy: { createdAt: "asc" } });
    expect(votes.map((v) => v.optionId)).toEqual([p.options[0].id, p.options[1].id]);
  });

  it("locks a published poll after its opening time even without votes", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    expect((await getPollForEdit(id, NOW))?.locked).toBe(true);
    const e = await edit(id);
    expect((await savePoll({ ...e, options: [e.options[1], e.options[0]] }, NOW)).ok).toBe(false);
  });
});

describe("controls", () => {
  it("closes early, reopens with a new closing time, archives and unarchives", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    expect((await changePollState(id, "archive", NOW)).ok).toBe(false);
    expect((await changePollState(id, "close", NOW)).ok).toBe(true);
    let p = (await getPollForEdit(id, NOW))!;
    expect([p.status, p.phase]).toEqual(["CLOSED", "closed"]);
    expect(p.endsAt).toEqual(NOW);

    expect((await reopenPoll(id, at(0.01), NOW)).ok).toBe(false);
    expect((await reopenPoll(id, at(24), NOW)).ok).toBe(true);
    p = (await getPollForEdit(id, NOW))!;
    expect(p.phase).toBe("active");

    await changePollState(id, "close", NOW);
    expect((await changePollState(id, "archive", NOW)).ok).toBe(true);
    expect((await reopenPoll(id, at(24), NOW)).ok).toBe(false);
    expect((await changePollState(id, "unarchive", NOW)).ok).toBe(true);
    expect((await getPollForEdit(id, NOW))?.status).toBe("CLOSED");
  });

  it("goes back to draft only without votes; hiding and the bin keep votes", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    await vote(id, 0);
    expect((await changePollState(id, "unpublish", NOW)).ok).toBe(false);
    expect((await changePollState(id, "hide", NOW)).ok).toBe(true);
    expect((await getPollForEdit(id, NOW))?.isHidden).toBe(true);
    expect((await changePollState(id, "bin", NOW)).ok).toBe(true);
    expect((await savePoll(await edit(id), NOW)).ok).toBe(false);
    expect((await listPolls({ deleted: true, q: RUN }, NOW)).rows.some((r) => r.id === id)).toBe(true);
    expect((await changePollState(id, "restore", NOW)).ok).toBe(true);
    expect(await db.pollVote.count({ where: { pollId: id } })).toBe(1);

    const empty = await create();
    await savePoll({ ...(await edit(empty)), intent: "publish" }, NOW);
    expect((await changePollState(empty, "unpublish", NOW)).ok).toBe(true);
    expect((await getPollForEdit(empty, NOW))?.status).toBe("DRAFT");
  });

  it("filters the list by phase", async () => {
    const upcoming = await create({ startsAt: at(5), endsAt: at(50) });
    await savePoll({ ...(await edit(upcoming)), intent: "publish" }, NOW);
    const rows = (await listPolls({ phase: "upcoming", q: RUN }, NOW)).rows;
    expect(rows.some((r) => r.id === upcoming)).toBe(true);
    expect(rows.every((r) => r.phase === "upcoming")).toBe(true);
  });
});

describe("results report", () => {
  it("counts votes, identities, editions, rejected attempts and comments", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    await vote(id, 0);
    await vote(id, 0, { codeName: "කුරුල්ලා", comment: "හොඳයි" });
    await vote(id, 1, { locale: "en" });
    await db.pollEvent.createMany({ data: [{ pollId: id, type: "DUPLICATE_ATTEMPT" }, { pollId: id, type: "DUPLICATE_ATTEMPT" }, { pollId: id, type: "HONEYPOT" }] });
    const r = (await getPollReport(id))!;
    expect(r.total).toBe(3);
    expect(r.options.map((o) => [o.votes, o.percent])).toEqual([[2, 67], [1, 33]]);
    expect(r.identity).toEqual({ anonymous: 2, codeName: 1 });
    expect(r.editions).toEqual({ si: 2, en: 1 });
    expect(r.rejected).toEqual([{ type: "DUPLICATE_ATTEMPT", count: 2 }, { type: "HONEYPOT", count: 1 }]);
    expect(r.comments).toEqual({ PENDING: 1, APPROVED: 0, HIDDEN: 0 });
    expect(r.byDay.reduce((s, d) => s + d.votes, 0)).toBe(3);
  });
});

describe("comment moderation", () => {
  it("lists flagged comments first, and publishes only approved ones", async () => {
    const id = await create({ startsAt: at(-1) });
    await savePoll({ ...(await edit(id)), intent: "publish" }, NOW);
    const plain = await vote(id, 0, { comment: "සාමාන්‍ය අදහසක්" });
    const flagged = await vote(id, 1, { comment: "http://spam.example", flagged: true });
    const queue = await listComments({ status: "PENDING", pollId: id });
    expect(queue.items.map((c) => c.body)).toEqual(["http://spam.example", "සාමාන්‍ය අදහසක්"]);
    expect(queue.items[0].answer).toBe("නැත");

    expect((await getApprovedComments(id, null)).comments).toHaveLength(0);
    const plainComment = await db.pollComment.findUniqueOrThrow({ where: { voteId: plain.id } });
    const flaggedComment = await db.pollComment.findUniqueOrThrow({ where: { voteId: flagged.id } });
    expect(await moderateComments([plainComment.id], "APPROVED", NOW)).toBe(1);
    expect(await moderateComments([plainComment.id], "APPROVED", NOW)).toBe(0);
    expect(await moderateComments([flaggedComment.id], "HIDDEN", NOW)).toBe(1);
    const shown = await getApprovedComments(id, null);
    expect(shown.comments.map((c) => c.body)).toEqual(["සාමාන්‍ය අදහසක්"]);

    // Moderation never touches the votes or the text.
    expect(await db.pollVote.count({ where: { pollId: id } })).toBe(2);
    expect((await db.pollComment.findUniqueOrThrow({ where: { id: flaggedComment.id } })).body).toBe("http://spam.example");

    // Back to the queue clears the moderation time.
    await moderateComments([flaggedComment.id], "PENDING", NOW);
    expect((await db.pollComment.findUniqueOrThrow({ where: { id: flaggedComment.id } })).moderatedAt).toBeNull();
  });
});

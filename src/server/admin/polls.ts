import "server-only";
import { db } from "@/server/db/client";
import type { CommentStatus, PollEventType, PollResultsVisibility, PollStatus, Prisma } from "@/generated/prisma/client";
import { pollPhase, type PollPhase } from "@/lib/polls/phase";
import { withPercentages } from "@/lib/polls/results";
import { isValidSlug, RESERVED_SLUGS } from "@/lib/content/slug";
import type { FieldErrors } from "./articles";

/**
 * Public Opinions administration. Callers must have checked the admin session.
 *
 * Integrity rules (see docs/polls.md): votes are never edited or deleted from
 * here. Once a poll has votes, or has been published and reached its start
 * time, its options can be reworded but not added, removed or reordered, and
 * its start time is fixed. A published poll keeps its slug, because links to
 * it have been shared and polls have no redirect table.
 */

export const POLL_LIMITS = { question: 300, description: 1000, seoTitle: 120, metaDescription: 300, option: 150, minOptions: 2, maxOptions: 10, maxDays: 366 } as const;
export const ADMIN_POLL_PAGE_SIZE = 25;
export const COMMENT_PAGE_SIZE = 30;

type L = "si" | "en";

// ───────────────────────── listing ─────────────────────────

export type PollListRow = {
  id: string;
  slug: string;
  question: { si: string | null; en: string | null };
  phase: PollPhase;
  isHidden: boolean;
  deletedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  votes: number;
  pendingComments: number;
};

export type PollListFilter = { q?: string; phase?: PollPhase; deleted?: boolean; page?: number };

/** Database condition for a phase, mirroring lib/polls/phase.ts. */
function phaseWhere(phase: PollPhase, now: Date): Prisma.PollWhereInput {
  const published = { status: { in: ["SCHEDULED", "ACTIVE"] as PollStatus[] } };
  switch (phase) {
    case "draft":
      return { status: "DRAFT" };
    case "archived":
      return { status: "ARCHIVED" };
    case "upcoming":
      return { ...published, startsAt: { gt: now } };
    case "active":
      return { ...published, startsAt: { lte: now }, endsAt: { gt: now } };
    case "closed":
      return { OR: [{ status: "CLOSED" }, { ...published, endsAt: { lte: now } }] };
  }
}

export async function listPolls(filter: PollListFilter, now: Date) {
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim().slice(0, 100);
  const and: Prisma.PollWhereInput[] = [{ deletedAt: filter.deleted ? { not: null } : null }];
  if (q) and.push({ OR: [{ slug: { contains: q.toLowerCase() } }, { translations: { some: { question: { contains: q, mode: "insensitive" } } } }] });
  if (filter.phase) and.push(phaseWhere(filter.phase, now));
  const where: Prisma.PollWhereInput = { AND: and };

  const [total, polls] = await Promise.all([
    db.poll.count({ where }),
    db.poll.findMany({
      where,
      orderBy: [{ startsAt: "desc" }],
      skip: (page - 1) * ADMIN_POLL_PAGE_SIZE,
      take: ADMIN_POLL_PAGE_SIZE,
      include: { translations: { select: { locale: true, question: true } } },
    }),
  ]);
  const ids = polls.map((p) => p.id);
  const [votes, pending] = await Promise.all([
    db.pollVote.groupBy({ by: ["pollId"], where: { pollId: { in: ids } }, _count: { _all: true } }),
    db.pollVote.groupBy({ by: ["pollId"], where: { pollId: { in: ids }, comment: { status: "PENDING" } }, _count: { _all: true } }),
  ]);
  const voteMap = new Map(votes.map((v) => [v.pollId, v._count._all]));
  const pendingMap = new Map(pending.map((v) => [v.pollId, v._count._all]));

  const rows: PollListRow[] = polls.map((p) => ({
    id: p.id,
    slug: p.slug,
    question: {
      si: p.translations.find((t) => t.locale === "si")?.question ?? null,
      en: p.translations.find((t) => t.locale === "en")?.question ?? null,
    },
    phase: pollPhase(p, now),
    isHidden: p.isHidden,
    deletedAt: p.deletedAt,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    votes: voteMap.get(p.id) ?? 0,
    pendingComments: pendingMap.get(p.id) ?? 0,
  }));
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_POLL_PAGE_SIZE)) };
}

// ───────────────────────── one poll ─────────────────────────

export type EditablePoll = {
  id: string;
  slug: string;
  status: PollStatus;
  phase: PollPhase;
  isHidden: boolean;
  deletedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  resultsVisibility: PollResultsVisibility;
  featuredMediaId: string | null;
  updatedAt: Date;
  totalVotes: number;
  /** Options and start time can no longer change. */
  locked: boolean;
  translations: Record<L, { question: string; description: string; seoTitle: string; metaDescription: string } | null>;
  options: { id: string; si: string; en: string; votes: number }[];
};

function isLocked(p: { status: PollStatus; startsAt: Date }, votes: number, now: Date): boolean {
  return votes > 0 || (p.status !== "DRAFT" && now >= p.startsAt);
}

export async function getPollForEdit(id: string, now: Date): Promise<EditablePoll | null> {
  const p = await db.poll.findUnique({
    where: { id },
    include: {
      translations: true,
      options: { orderBy: { sortOrder: "asc" }, include: { translations: true, _count: { select: { votes: true } } } },
    },
  });
  if (!p) return null;
  const totalVotes = p.options.reduce((n, o) => n + o._count.votes, 0);
  const tr = (l: L) => {
    const t = p.translations.find((x) => x.locale === l);
    return t ? { question: t.question, description: t.description, seoTitle: t.seoTitle ?? "", metaDescription: t.metaDescription ?? "" } : null;
  };
  return {
    id: p.id,
    slug: p.slug,
    status: p.status,
    phase: pollPhase(p, now),
    isHidden: p.isHidden,
    deletedAt: p.deletedAt,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    resultsVisibility: p.resultsVisibility,
    featuredMediaId: p.featuredMediaId,
    updatedAt: p.updatedAt,
    totalVotes,
    locked: isLocked(p, totalVotes, now),
    translations: { si: tr("si"), en: tr("en") },
    options: p.options.map((o) => ({
      id: o.id,
      si: o.translations.find((t) => t.locale === "si")?.label ?? "",
      en: o.translations.find((t) => t.locale === "en")?.label ?? "",
      votes: o._count.votes,
    })),
  };
}

// ───────────────────────── save ─────────────────────────

export type PollInput = {
  id: string | null;
  expectedUpdatedAt: string | null;
  intent: "save" | "publish";
  slug: string;
  startsAt: Date | null;
  endsAt: Date | null;
  resultsVisibility: PollResultsVisibility;
  featuredMediaId: string | null;
  si: { question: string; description: string; seoTitle: string; metaDescription: string };
  en: { question: string; description: string; seoTitle: string; metaDescription: string };
  options: { id: string | null; si: string; en: string }[];
};

export type PollSaveResult = { ok: true; id: string; status: PollStatus; updatedAt: string } | { ok: false; errors: FieldErrors; message: string };

const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

export async function savePoll(input: PollInput, now: Date): Promise<PollSaveResult> {
  const current = input.id ? await getPollForEdit(input.id, now) : null;
  if (input.id && !current) return { ok: false, errors: {}, message: "This poll no longer exists." };
  if (current?.deletedAt) return { ok: false, errors: {}, message: "This poll is in the bin. Restore it before editing." };
  if (current && input.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return { ok: false, errors: {}, message: "This poll was changed somewhere else (another tab or window) after you opened it. Reload the page, then re-apply your changes." };
  }

  const errors: FieldErrors = {};
  const t = (s: string) => s.trim();
  const si = { question: t(input.si.question), description: t(input.si.description), seoTitle: t(input.si.seoTitle), metaDescription: t(input.si.metaDescription) };
  const en = { question: t(input.en.question), description: t(input.en.description), seoTitle: t(input.en.seoTitle), metaDescription: t(input.en.metaDescription) };
  const hasEn = !!(en.question || en.description || input.options.some((o) => o.en.trim()));

  if (!si.question) errors["si.question"] = "Enter the question in Sinhala.";
  if (hasEn && !en.question) errors["en.question"] = "Enter the English question, or clear the other English fields to publish in Sinhala only.";
  for (const [l, v] of [["si", si], ["en", en]] as const) {
    if (v.question.length > POLL_LIMITS.question) errors[`${l}.question`] = `Keep the question under ${POLL_LIMITS.question} characters.`;
    if (v.description.length > POLL_LIMITS.description) errors[`${l}.description`] = `Keep the description under ${POLL_LIMITS.description} characters.`;
    if (v.seoTitle.length > POLL_LIMITS.seoTitle) errors[`${l}.seoTitle`] = `Keep it under ${POLL_LIMITS.seoTitle} characters.`;
    if (v.metaDescription.length > POLL_LIMITS.metaDescription) errors[`${l}.metaDescription`] = `Keep it under ${POLL_LIMITS.metaDescription} characters.`;
  }

  // Options.
  const options = input.options.map((o) => ({ id: o.id, si: t(o.si), en: t(o.en) }));
  if (options.length < POLL_LIMITS.minOptions) errors.options = `A poll needs at least ${POLL_LIMITS.minOptions} answers.`;
  if (options.length > POLL_LIMITS.maxOptions) errors.options = `A poll can have at most ${POLL_LIMITS.maxOptions} answers.`;
  options.forEach((o, i) => {
    if (!o.si) errors[`options.${i}.si`] = "Enter this answer in Sinhala.";
    else if (o.si.length > POLL_LIMITS.option) errors[`options.${i}.si`] = `Keep answers under ${POLL_LIMITS.option} characters.`;
    if (hasEn && !o.en) errors[`options.${i}.en`] = "Enter this answer in English too.";
    else if (o.en.length > POLL_LIMITS.option) errors[`options.${i}.en`] = `Keep answers under ${POLL_LIMITS.option} characters.`;
  });
  const siLabels = options.map((o) => o.si.toLowerCase()).filter(Boolean);
  if (new Set(siLabels).size !== siLabels.length) errors.options = "Two answers have the same Sinhala text.";

  // Slug.
  const published = current && current.status !== "DRAFT";
  if (current && published && input.slug !== current.slug) {
    errors.slug = "A published poll keeps its web address, because links to it have been shared.";
  } else if (!isValidSlug(input.slug)) {
    errors.slug = "Use lowercase English letters, numbers and single hyphens.";
  } else if (RESERVED_SLUGS.has(input.slug)) {
    errors.slug = "This word is used by the site itself. Choose another slug.";
  } else if (await db.poll.findFirst({ where: { slug: input.slug, ...(current ? { id: { not: current.id } } : {}) }, select: { id: true } })) {
    errors.slug = "Another poll already uses this slug.";
  }

  // Times.
  if (!input.startsAt) errors.startsAt = "Choose when voting opens.";
  if (!input.endsAt) errors.endsAt = "Choose when voting closes.";
  if (input.startsAt && input.endsAt) {
    if (input.endsAt <= input.startsAt) errors.endsAt = "Voting must close after it opens.";
    else if (input.endsAt.getTime() - input.startsAt.getTime() > POLL_LIMITS.maxDays * 86_400_000) errors.endsAt = "A poll can run for at most one year.";
  }
  const goingLive = input.intent === "publish" || (published && current?.status !== "CLOSED" && current?.status !== "ARCHIVED");
  if (goingLive && input.endsAt && input.endsAt <= now && !(current && sameMinute(input.endsAt, current.endsAt))) {
    errors.endsAt = "The closing time has already passed. Choose a later time, or use Close voting instead.";
  }

  // Locked polls: answers and start time are fixed.
  if (current?.locked) {
    const before = current.options.map((o) => o.id);
    const after = options.map((o) => o.id);
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) {
      errors.options = "Voting has started, so answers can no longer be added, removed or reordered. You can still correct their wording.";
    }
    if (input.startsAt && !sameMinute(input.startsAt, current.startsAt)) errors.startsAt = "Voting has started, so the opening time can no longer change.";
  } else if (current) {
    const known = new Set(current.options.map((o) => o.id));
    if (options.some((o) => o.id && !known.has(o.id))) errors.options = "An answer no longer exists. Reload the page.";
  } else if (options.some((o) => o.id)) {
    errors.options = "The form could not be read. Reload the page.";
  }

  if (input.featuredMediaId && !(await db.media.count({ where: { id: input.featuredMediaId } }))) errors.featuredMediaId = "The selected image no longer exists.";

  if (Object.keys(errors).length) return { ok: false, errors, message: "Nothing was saved. Fix the highlighted fields." };

  const status: PollStatus = input.intent === "publish" && (!current || current.status === "DRAFT") ? "ACTIVE" : (current?.status ?? "DRAFT");
  const data = {
    slug: input.slug,
    status,
    startsAt: current?.locked ? current.startsAt : input.startsAt!,
    endsAt: input.endsAt!,
    resultsVisibility: input.resultsVisibility,
    featuredMediaId: input.featuredMediaId,
  };
  const translations = (hasEn ? (["si", "en"] as const) : (["si"] as const)).map((locale) => {
    const v = locale === "si" ? si : en;
    return { locale, question: v.question, description: v.description, seoTitle: v.seoTitle || null, metaDescription: v.metaDescription || null };
  });
  const labels = (o: (typeof options)[number]) => [{ locale: "si" as const, label: o.si }, ...(hasEn ? [{ locale: "en" as const, label: o.en }] : [])];

  const saved = await db.$transaction(async (tx) => {
    const poll = current ? await tx.poll.update({ where: { id: current.id }, data }) : await tx.poll.create({ data });
    await tx.pollTranslation.deleteMany({ where: { pollId: poll.id, locale: { notIn: translations.map((x) => x.locale) } } });
    for (const tr of translations) {
      await tx.pollTranslation.upsert({ where: { pollId_locale: { pollId: poll.id, locale: tr.locale } }, create: { ...tr, pollId: poll.id }, update: tr });
    }
    if (!current?.locked && current) {
      // No votes exist (that is what "not locked" means), so removing answers loses nothing.
      const keep = options.map((o) => o.id).filter((x): x is string => !!x);
      await tx.pollOption.deleteMany({ where: { pollId: poll.id, id: { notIn: keep } } });
    }
    for (const [i, o] of options.entries()) {
      if (o.id) {
        await tx.pollOption.update({ where: { id: o.id }, data: current?.locked ? {} : { sortOrder: i } });
        await tx.pollOptionTranslation.deleteMany({ where: { optionId: o.id, locale: { notIn: labels(o).map((x) => x.locale) } } });
        for (const lb of labels(o)) {
          await tx.pollOptionTranslation.upsert({ where: { optionId_locale: { optionId: o.id, locale: lb.locale } }, create: { ...lb, optionId: o.id }, update: { label: lb.label } });
        }
      } else {
        await tx.pollOption.create({ data: { pollId: poll.id, sortOrder: i, translations: { create: labels(o) } } });
      }
    }
    return { id: poll.id, updatedAt: poll.updatedAt.toISOString() };
  });
  return { ok: true, id: saved.id, status, updatedAt: saved.updatedAt };
}

// ───────────────────────── state changes ─────────────────────────

export type PollAction = "close" | "archive" | "unarchive" | "hide" | "show" | "unpublish" | "bin" | "restore";

export async function changePollState(id: string, action: PollAction, now: Date): Promise<{ ok: true } | { ok: false; message: string }> {
  const p = await getPollForEdit(id, now);
  if (!p) return { ok: false, message: "This poll no longer exists." };
  if (p.deletedAt && action !== "restore") return { ok: false, message: "This poll is in the bin. Restore it first." };
  const update = (data: Prisma.PollUpdateInput) => db.poll.update({ where: { id }, data }).then(() => ({ ok: true as const }));
  switch (action) {
    case "close":
      if (p.phase !== "active" && p.phase !== "upcoming") return { ok: false, message: "Only an open or upcoming poll can be closed." };
      return update({ status: "CLOSED", ...(p.endsAt > now ? { endsAt: now } : {}) });
    case "archive":
      if (p.phase !== "closed") return { ok: false, message: "Close the poll before archiving it." };
      return update({ status: "ARCHIVED" });
    case "unarchive":
      if (p.status !== "ARCHIVED") return { ok: false, message: "This poll is not archived." };
      return update({ status: "CLOSED" });
    case "hide":
      return update({ isHidden: true });
    case "show":
      return update({ isHidden: false });
    case "unpublish":
      if (p.status === "DRAFT") return { ok: false, message: "This poll is already a draft." };
      if (p.totalVotes > 0) return { ok: false, message: "This poll has votes, so it cannot go back to draft. Hide or close it instead." };
      return update({ status: "DRAFT" });
    case "bin":
      return update({ deletedAt: now });
    case "restore":
      return update({ deletedAt: null });
  }
}

/**
 * Reopening after an early close: setting a future closing time on a CLOSED
 * poll makes it ACTIVE again. Votes already cast are untouched.
 */
export async function reopenPoll(id: string, endsAt: Date, now: Date): Promise<{ ok: true } | { ok: false; message: string }> {
  const p = await getPollForEdit(id, now);
  if (!p || p.deletedAt) return { ok: false, message: "This poll no longer exists." };
  if (p.status !== "CLOSED" && !(p.phase === "closed" && p.status !== "ARCHIVED")) return { ok: false, message: "Only a closed poll can be reopened." };
  if (endsAt.getTime() <= now.getTime() + 60_000) return { ok: false, message: "Choose a closing time at least two minutes from now." };
  if (endsAt.getTime() - p.startsAt.getTime() > POLL_LIMITS.maxDays * 86_400_000) return { ok: false, message: "A poll can run for at most one year." };
  await db.poll.update({ where: { id }, data: { status: "ACTIVE", endsAt } });
  return { ok: true };
}

// ───────────────────────── results ─────────────────────────

export type PollReport = {
  total: number;
  options: { id: string; si: string; en: string; votes: number; percent: number }[];
  identity: { anonymous: number; codeName: number };
  editions: { si: number; en: number };
  freshDevices: number;
  byDay: { day: string; votes: number }[];
  rejected: { type: PollEventType; count: number }[];
  comments: Record<CommentStatus, number>;
};

const COLOMBO = 5.5 * 3_600_000;

export async function getPollReport(id: string): Promise<PollReport | null> {
  const p = await db.poll.findUnique({ where: { id }, include: { options: { orderBy: { sortOrder: "asc" }, include: { translations: true } } } });
  if (!p) return null;
  const [byOption, byIdentity, byLocale, fresh, times, events, comments] = await Promise.all([
    db.pollVote.groupBy({ by: ["optionId"], where: { pollId: id }, _count: { _all: true } }),
    db.pollVote.groupBy({ by: ["identity"], where: { pollId: id }, _count: { _all: true } }),
    db.pollVote.groupBy({ by: ["locale"], where: { pollId: id }, _count: { _all: true } }),
    db.pollVote.count({ where: { pollId: id, freshDevice: true } }),
    db.pollVote.findMany({ where: { pollId: id }, select: { createdAt: true } }),
    db.pollEvent.groupBy({ by: ["type"], where: { pollId: id }, _count: { _all: true } }),
    db.pollComment.groupBy({ by: ["status"], where: { vote: { pollId: id } }, _count: { _all: true } }),
  ]);
  const count = new Map(byOption.map((v) => [v.optionId, v._count._all]));
  const withPct = withPercentages(p.options.map((o) => ({ optionId: o.id, label: "", votes: count.get(o.id) ?? 0 })));
  const days = new Map<string, number>();
  for (const v of times) {
    const day = new Date(v.createdAt.getTime() + COLOMBO).toISOString().slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return {
    total: withPct.total,
    options: p.options.map((o, i) => ({
      id: o.id,
      si: o.translations.find((t) => t.locale === "si")?.label ?? "",
      en: o.translations.find((t) => t.locale === "en")?.label ?? "",
      votes: withPct.options[i].votes,
      percent: withPct.options[i].percent,
    })),
    identity: {
      anonymous: byIdentity.find((x) => x.identity === "ANONYMOUS")?._count._all ?? 0,
      codeName: byIdentity.find((x) => x.identity === "CODE_NAME")?._count._all ?? 0,
    },
    editions: { si: byLocale.find((x) => x.locale === "si")?._count._all ?? 0, en: byLocale.find((x) => x.locale === "en")?._count._all ?? 0 },
    freshDevices: fresh,
    byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, votes]) => ({ day, votes })),
    rejected: events.map((e) => ({ type: e.type, count: e._count._all })).sort((a, b) => b.count - a.count),
    comments: {
      PENDING: comments.find((c) => c.status === "PENDING")?._count._all ?? 0,
      APPROVED: comments.find((c) => c.status === "APPROVED")?._count._all ?? 0,
      HIDDEN: comments.find((c) => c.status === "HIDDEN")?._count._all ?? 0,
    },
  };
}

// ───────────────────────── comments ─────────────────────────

export type CommentRow = {
  id: string;
  body: string;
  status: CommentStatus;
  flagged: boolean;
  createdAt: Date;
  moderatedAt: Date | null;
  name: string | null;
  pollId: string;
  pollQuestion: string;
  answer: string;
};

export type CommentFilter = { status?: CommentStatus; pollId?: string; flaggedOnly?: boolean; page?: number };

export async function listComments(filter: CommentFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const where: Prisma.PollCommentWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.flaggedOnly ? { flagged: true } : {}),
    ...(filter.pollId ? { vote: { pollId: filter.pollId } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.pollComment.count({ where }),
    db.pollComment.findMany({
      where,
      // Flagged comments first in the queue; the oldest waiting ones before newer ones.
      orderBy: filter.status === "PENDING" ? [{ flagged: "desc" }, { createdAt: "asc" }] : [{ createdAt: "desc" }],
      skip: (page - 1) * COMMENT_PAGE_SIZE,
      take: COMMENT_PAGE_SIZE,
      select: {
        id: true,
        body: true,
        status: true,
        flagged: true,
        createdAt: true,
        moderatedAt: true,
        vote: {
          select: {
            identity: true,
            codeName: true,
            pollId: true,
            option: { select: { translations: { select: { locale: true, label: true } }, poll: { select: { translations: { select: { locale: true, question: true } } } } } },
          },
        },
      },
    }),
  ]);
  const items: CommentRow[] = rows.map((c) => {
    const q = c.vote.option.poll.translations;
    const a = c.vote.option.translations;
    return {
      id: c.id,
      body: c.body,
      status: c.status,
      flagged: c.flagged,
      createdAt: c.createdAt,
      moderatedAt: c.moderatedAt,
      name: c.vote.identity === "CODE_NAME" ? c.vote.codeName : null,
      pollId: c.vote.pollId,
      pollQuestion: (q.find((x) => x.locale === "si") ?? q[0])?.question ?? "",
      answer: (a.find((x) => x.locale === "si") ?? a[0])?.label ?? "",
    };
  });
  return { items, total, page, pages: Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE)) };
}

/** Approve, hide or return comments to the queue. The comment text and the vote are never changed. */
export async function moderateComments(ids: string[], status: CommentStatus, now: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await db.pollComment.updateMany({ where: { id: { in: ids }, status: { not: status } }, data: { status, moderatedAt: status === "PENDING" ? null : now } });
  return r.count;
}

export async function pollOptionsForFilter(): Promise<{ id: string; label: string }[]> {
  const polls = await db.poll.findMany({ where: { deletedAt: null }, orderBy: { startsAt: "desc" }, take: 200, include: { translations: { select: { locale: true, question: true } } } });
  return polls.map((p) => ({ id: p.id, label: (p.translations.find((t) => t.locale === "si") ?? p.translations[0])?.question ?? p.slug }));
}
